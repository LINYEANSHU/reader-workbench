param(
  [string]$DownloadDirectory = (Join-Path ([System.IO.Path]::GetTempPath()) 'reader-ci-fonts'),
  [switch]$VerifyOnly,
  [switch]$CheckInstalled
)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'This font setup is Windows-only' }

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ReaderCiFonts {
  [StructLayout(LayoutKind.Sequential, CharSet=System.Runtime.InteropServices.CharSet.Unicode)]
  public struct LogFont {
    public int Height, Width, Escapement, Orientation, Weight;
    public byte Italic, Underline, StrikeOut, CharSet, OutPrecision, ClipPrecision, Quality, PitchAndFamily;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string FaceName;
  }
  public delegate int FontCallback(IntPtr font, IntPtr metric, uint type, IntPtr data);
  [DllImport("gdi32.dll", CharSet=System.Runtime.InteropServices.CharSet.Unicode)] public static extern int AddFontResourceEx(string file, uint flags, IntPtr reserved);
  [DllImport("gdi32.dll", CharSet=System.Runtime.InteropServices.CharSet.Unicode)] private static extern int EnumFontFamiliesEx(IntPtr dc, ref LogFont font, FontCallback callback, IntPtr data, uint flags);
  [DllImport("user32.dll")] private static extern IntPtr GetDC(IntPtr window);
  [DllImport("user32.dll")] private static extern int ReleaseDC(IntPtr window, IntPtr dc);
  [DllImport("user32.dll", CharSet=System.Runtime.InteropServices.CharSet.Unicode)] private static extern IntPtr SendMessageTimeout(IntPtr window, uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
  public static void Notify() { IntPtr result; SendMessageTimeout(new IntPtr(0xffff), 0x001d, IntPtr.Zero, IntPtr.Zero, 2, 1000, out result); }
  public static bool Available(string family) {
    var dc=GetDC(IntPtr.Zero); if(dc==IntPtr.Zero) throw new Exception("Cannot inspect system fonts");
    bool found=false; var font=new LogFont { CharSet=1, FaceName=family };
    FontCallback callback=(pointer, metric, type, data)=>{
      var actual=Marshal.PtrToStructure<LogFont>(pointer);
      if(String.Equals(actual.FaceName, family, StringComparison.OrdinalIgnoreCase)) { found=true; return 0; }
      return 1;
    };
    try { EnumFontFamiliesEx(dc, ref font, callback, IntPtr.Zero, 0); return found; }
    finally { ReleaseDC(IntPtr.Zero, dc); GC.KeepAlive(callback); }
  }
}
'@

$readerFamily = 'Noto Sans CJK SC'
if ($CheckInstalled) {
  if (-not [ReaderCiFonts]::Available($readerFamily)) { throw "Required font family unavailable: $readerFamily" }
  Write-Output "Verified installed font family: $readerFamily"
  exit 0
}
if (-not $VerifyOnly -and $env:GITHUB_ACTIONS -ne 'true') { throw 'Machine-wide font installation is reserved for CI; use -VerifyOnly locally' }

# Official Noto Sans CJK 2.004, pinned to the tag's exact commit.
$readerUrl = 'https://raw.githubusercontent.com/notofonts/noto-cjk/523d033d6cb47f4a80c58a35753646f5c3608a78/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf'
$readerExpectedHash = '2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b'
$readerFontName = 'NotoSansCJKsc-Regular.otf'
New-Item -ItemType Directory -Path $DownloadDirectory -Force | Out-Null
$readerDownload = Join-Path $DownloadDirectory $readerFontName
if (-not (Test-Path -LiteralPath $readerDownload)) { Invoke-WebRequest -Uri $readerUrl -OutFile $readerDownload -TimeoutSec 180 -MaximumRetryCount 2 }
if ((Get-FileHash -LiteralPath $readerDownload -Algorithm SHA256).Hash.ToLowerInvariant() -ne $readerExpectedHash) { throw 'Noto CJK font hash mismatch' }
Write-Output "Verified Noto CJK 2.004 SHA-256: $readerExpectedHash"
if ($VerifyOnly) { exit 0 }

$readerInstalledFont = Join-Path $env:WINDIR ('Fonts/' + $readerFontName)
Copy-Item -LiteralPath $readerDownload -Destination $readerInstalledFont -Force
New-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts' -Name 'Noto Sans CJK SC (OpenType)' -Value $readerFontName -PropertyType String -Force | Out-Null
if ([ReaderCiFonts]::AddFontResourceEx($readerInstalledFont, 0, [IntPtr]::Zero) -le 0) { throw 'Cannot register Noto CJK font' }
[ReaderCiFonts]::Notify()
# Check discovery in a new process, before LibreOffice starts.
& (Join-Path $PSHOME 'pwsh.exe') -NoProfile -NonInteractive -File $PSCommandPath -CheckInstalled
if ($LASTEXITCODE -ne 0) { throw 'Noto CJK font is not visible to a fresh process' }
