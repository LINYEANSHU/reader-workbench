"""Install a private Windows CPU translation runtime; never modifies global Python."""
import argparse, hashlib, json, os, pathlib, shutil, subprocess, sys, tempfile, urllib.request, zipfile, uuid

PINS = ['ctranslate2==4.6.3', 'sentencepiece==0.2.1', 'numpy==2.2.6', 'PyYAML==6.0.2', 'setuptools==80.9.0', 'opencc-python-reimplemented==0.1.7']
INDEX = 'https://raw.githubusercontent.com/argosopentech/argospm-index/main/index.json'
PYTHON_URL = 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip'
PYTHON_SHA256 = '4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3'
MODEL_SHA256 = {'en_zh': '433e7c4f034d87fbe2353161e05f18646d7999452f801a4e1f0378522b9850ab', 'zh_en': '62e7af5a3a48b530e47b7b3e5c78c2de79073ecd815750d2bf3ab35b4a67da2d'}

def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''): h.update(chunk)
    return h.hexdigest()

def download(url, path):
    if not url.startswith('https://'): raise ValueError('Only HTTPS downloads are allowed')
    print('Downloading ' + url, flush=True)
    with urllib.request.urlopen(url, timeout=120) as source, open(path, 'wb') as target:
        shutil.copyfileobj(source, target)
    return digest(path)

def extract(archive, target):
    target = target.resolve()
    with zipfile.ZipFile(archive) as package:
        for item in package.infolist():
            destination = (target / item.filename).resolve()
            if not destination.is_relative_to(target) or (item.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('Unsafe archive path')
        package.extractall(target)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--runtime', default=str(pathlib.Path(__file__).resolve().parents[1] / '.reader-runtime' / 'translation'))
    parser.add_argument('--repair', action='store_true', help='Preserve the old runtime as a backup and install a fresh one')
    args = parser.parse_args()
    if sys.platform != 'win32' or sys.version_info[:2] != (3, 12):
        raise RuntimeError('Bootstrap this Windows installer with a 64-bit Python 3.12 interpreter')
    runtime = pathlib.Path(args.runtime).resolve()
    runtime.parent.mkdir(parents=True, exist_ok=True)
    if runtime.exists() and not args.repair:
        try:
            manifest = json.loads((runtime / 'ready.json').read_text(encoding='utf-8'))
            if manifest.get('engine') != 'CTranslate2' or manifest.get('dependencies') != PINS: raise RuntimeError('Runtime requires an update')
            for direction in ['en_zh', 'zh_en']:
                for relative in ['model/model.bin', 'sentencepiece.model']:
                    if not (runtime / 'models' / direction / relative).is_file(): raise RuntimeError('Model files are incomplete')
            subprocess.run([str(runtime / 'python' / 'python.exe'), '-I', '-c', 'import ctranslate2,sentencepiece;from opencc import OpenCC;assert OpenCC("t2s").convert("天氣")=="天气"'], check=True, capture_output=True)
        except Exception as error:
            raise RuntimeError('Existing runtime is incomplete or outdated; run again with --repair (PowerShell: -Repair). Its files will be preserved as a backup.') from error
        print('Translation runtime already installed and verified: ' + str(runtime)); return
    stage = pathlib.Path(tempfile.mkdtemp(prefix='translation-install-', dir=runtime.parent))
    try:
        cache = stage / 'downloads'; cache.mkdir()
        pyzip = cache / 'python.zip'; python_hash = download(PYTHON_URL, pyzip)
        if python_hash != PYTHON_SHA256: raise RuntimeError('Embedded Python SHA256 mismatch')
        extract(pyzip, stage / 'python')
        (stage / 'python' / 'python312._pth').write_text('python312.zip\n.\n../site-packages\n', encoding='utf-8')
        subprocess.run([sys.executable, '-m', 'pip', 'install', '--disable-pip-version-check', '--index-url', 'https://pypi.org/simple', '--only-binary=:all:', '--no-deps', '--target', str(stage / 'site-packages'), *PINS], check=True)
        index_path = cache / 'index.json'; index_hash = download(INDEX, index_path)
        index = json.loads(index_path.read_text(encoding='utf-8'))
        models = []
        for source, target in [('en', 'zh'), ('zh', 'en')]:
            entry = next(item for item in index if item['from_code'] == source and item['to_code'] == target and item['package_version'] == '1.9')
            url = next(link for link in entry['links'] if link.startswith('https://'))
            archive = cache / (source + '_' + target + '.argosmodel')
            try: model_hash = download(url, archive)
            except Exception:
                # Same official package from the long-standing Argos data mirror.
                url = 'https://data.argosopentech.com/argospm/v1/translate-' + source + '_' + target + '-1_9.argosmodel'
                model_hash = download(url, archive)
            if model_hash != MODEL_SHA256[source + '_' + target]: raise RuntimeError('Official model archive SHA256 mismatch')
            unpack = stage / ('unpack-' + source); extract(archive, unpack)
            candidates = list(unpack.rglob('sentencepiece.model'))
            if len(candidates) != 1: raise RuntimeError('Official package requires a supported SentencePiece tokenizer')
            model_root = candidates[0].parent
            if not (model_root / 'model' / 'model.bin').is_file(): raise RuntimeError('Missing CTranslate2 model.bin')
            destination = stage / 'models' / (source + '_' + target)
            destination.parent.mkdir(exist_ok=True)
            shutil.move(str(model_root), destination)
            shutil.rmtree(unpack)
            models.append({'direction': source + '_' + target, 'version': '1.9', 'url': url, 'archiveSha256': model_hash, 'modelSha256': digest(destination / 'model' / 'model.bin'), 'tokenizerSha256': digest(destination / 'sentencepiece.model')})
        shutil.rmtree(cache)
        manifest = {'schemaVersion': 1, 'engine': 'CTranslate2', 'computeType': 'int8', 'device': 'cpu', 'python': {'version': '3.12.10', 'url': PYTHON_URL, 'sha256': python_hash}, 'dependencies': PINS, 'index': {'url': INDEX, 'sha256': index_hash}, 'models': models}
        # Imports and both engine files must be usable before publishing readiness.
        subprocess.run([str(stage / 'python' / 'python.exe'), '-I', '-c', 'import ctranslate2,sentencepiece;from opencc import OpenCC;assert OpenCC("t2s").convert("天氣")=="天气";print("Runtime imports OK",ctranslate2.__version__,sentencepiece.__version__)'], check=True)
        (stage / 'ready.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        backup = None
        if runtime.exists():
            if not args.repair: raise RuntimeError('Runtime appeared during installation; refusing to overwrite it')
            backup = runtime.with_name(runtime.name + '.backup-' + uuid.uuid4().hex)
            runtime.rename(backup)
        try: stage.rename(runtime)
        except BaseException:
            if backup is not None: backup.rename(runtime)
            raise
        if backup is not None: print('Previous runtime preserved: ' + str(backup), flush=True)
        print('Offline translation ready: ' + str(runtime), flush=True)
    except BaseException:
        print('Incomplete installation preserved for diagnosis: ' + str(stage), file=sys.stderr)
        raise
if __name__ == '__main__': main()
