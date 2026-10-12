cask "libreoffice-ci" do
  arch arm: "aarch64", intel: "x86-64"
  folder = on_arch_conditional arm: "aarch64", intel: "x86_64"

  version "26.2.5"
  sha256 arm:   "c99fb4fe574437fc4cb820a4ca15271bca325920861f7139858b36d7f9df78ad",
         intel: "e26180298685274b54aa7fe6e1101c65465a372f457a6748ebd642720811db36"

  url "https://download.documentfoundation.org/libreoffice/stable/#{version}/mac/#{folder}/LibreOffice_#{version}_MacOS_#{arch}.dmg",
      verified: "download.documentfoundation.org/libreoffice/stable/"
  name "LibreOffice CI"
  desc "Pinned LibreOffice version for cross-platform verification"
  homepage "https://www.libreoffice.org/"

  depends_on :macos

  app "LibreOffice.app"
  command_wrapper "soffice",
                  executable: "#{appdir}/LibreOffice.app/Contents/MacOS/soffice"
end
