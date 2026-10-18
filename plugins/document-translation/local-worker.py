"""Single-request offline translation worker. stdout is JSON only; inference cannot use sockets."""
import argparse
import json
import os
import pathlib
import re
import sys

INPUT_LIMIT = 1024 * 1024
OUTPUT_LIMIT = 16 * 1024 * 1024
KEEP = re.compile(r'(__RW_KEEP_\d+__|\r?\n|`+[^`\r\n]*`+|\$[^$\r\n]+\$|\d+(?:[.,]\d+)*(?:%|²|³)?)')
HAN = re.compile(r'[\u3400-\u9fff]')


def deny_network(event, args):
    if event in ('socket.connect', 'socket.getaddrinfo', 'socket.bind', 'socket.sendto'):
        raise RuntimeError('Network access is disabled in the offline translation worker')


def validate(value):
    if not isinstance(value, dict) or value.get('targetLanguage') not in ('简体中文', 'English'):
        raise ValueError('Only 简体中文 and English targets are supported')
    blocks = value.get('blocks')
    if not isinstance(blocks, list) or not 0 < len(blocks) <= 512:
        raise ValueError('Invalid translation block count')
    ids = set()
    for block in blocks:
        if not isinstance(block, dict) or not isinstance(block.get('id'), str) or not block['id'] or len(block['id']) > 256 or block['id'] in ids:
            raise ValueError('Invalid or duplicate translation block ID')
        if not isinstance(block.get('text'), str) or not block['text'].strip() or len(block['text'].encode('utf-8')) > 64 * 1024:
            raise ValueError('Invalid translation block text')
        ids.add(block['id'])
    return value


class Engine:
    def __init__(self, runtime):
        import ctranslate2
        import sentencepiece
        from opencc import OpenCC
        self.ct2, self.sp = ctranslate2, sentencepiece
        self.simplified = OpenCC('t2s')
        self.runtime, self.models = runtime, {}

    def translate(self, text, direction):
        if direction not in self.models:
            root = self.runtime / 'models' / direction
            translator = self.ct2.Translator(str(root / 'model'), device='cpu', compute_type='int8', inter_threads=1, intra_threads=max(1, min(4, os.cpu_count() or 1)))
            tokenizer = self.sp.SentencePieceProcessor(model_file=str(root / 'sentencepiece.model'))
            self.models[direction] = translator, tokenizer
        translator, tokenizer = self.models[direction]
        tokens = tokenizer.encode(text, out_type=str)
        if len(tokens) > 1024:
            raise ValueError('Translation sentence exceeds the local engine input bound')
        output = translator.translate_batch([tokens], beam_size=4, max_input_length=0, max_decoding_length=min(2048, max(128, len(tokens) * 4)), return_scores=False)[0].hypotheses[0]
        result = tokenizer.decode_pieces(output).replace('▁', ' ')
        if not result.strip():
            raise RuntimeError('Local engine returned empty translation')
        return result.strip()


def prose(text, target, engine):
    if not text.strip(): return text
    match = re.fullmatch(r'(\s*)(.*?)(\s*)', text, flags=re.S)
    leading, core, trailing = match.groups()
    chinese = bool(HAN.search(core))
    if chinese and re.search(r'[A-Za-z]{2,}', core):
        # Translate each script span so an annotation in the target language
        # cannot suppress the surrounding source-language prose.
        spans = re.split(r'([\u3400-\u9fff][\u3400-\u9fff\s，。！？；：“”‘’、（）]*)', core)
        result = ''
        for span in spans:
            if not span: continue
            translated = prose(span, target, engine)
            if target == 'English' and re.search(r'[A-Za-z0-9]$', result) and re.match(r'[A-Za-z0-9]', translated): result += ' '
            result += translated
        return leading + result + trailing
    if target == '简体中文' and chinese:
        return leading + engine.simplified.convert(core) + trailing
    if target == 'English' and not chinese:
        return text
    if not chinese and not re.search(r'[A-Za-z]{2,}', core): return text
    # Formula-only fragments remain literal even when they contain short variable names.
    if re.search(r'[=∑∫√≠≤≥±∞α-ωΑ-Ω]', core) and not re.search(r'[A-Za-z]{4,}', core): return text
    direction = 'zh_en' if chinese else 'en_zh'
    # Sentence boundaries are local and deterministic; no downloaded sentence splitter.
    sentences = re.split(r'(?<=[.!?。！？;；])(?=\s|[\u3400-\u9fff])', core)
    translated = []
    for sentence in sentences:
        if not sentence: continue
        chunks = []
        while len(sentence) > 450:
            cut = sentence.rfind(' ', 0, 450) if not chinese else 240
            if cut < 1: cut = 240
            chunks.append(sentence[:cut]); sentence = sentence[cut:]
        chunks.append(sentence)
        for chunk in chunks:
            boundary = re.fullmatch(r'(\s*)(.*?)(\s*)', chunk, flags=re.S)
            left, body, right = boundary.groups()
            result = engine.translate(body, direction) if body else ''
            if target == '简体中文': result = engine.simplified.convert(result)
            translated.append(left + result + right)
    return leading + ''.join(translated) + trailing


def translate_text(text, target, engine):
    parts = KEEP.split(text)
    translated = ''.join(part if index % 2 else prose(part, target, engine) for index, part in enumerate(parts))
    if re.findall(r'__RW_KEEP_\d+__', text) != re.findall(r'__RW_KEEP_\d+__', translated):
        raise RuntimeError('Protected token order changed')
    return translated


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--runtime', required=True)
    args = parser.parse_args()
    runtime = pathlib.Path(args.runtime).resolve()
    manifest = json.loads((runtime / 'ready.json').read_text(encoding='utf-8'))
    if manifest.get('schemaVersion') != 1 or manifest.get('engine') != 'CTranslate2':
        raise RuntimeError('Unsupported offline runtime manifest')
    raw = sys.stdin.buffer.read(INPUT_LIMIT + 1)
    if len(raw) > INPUT_LIMIT: raise ValueError('Input exceeds the safe bound')
    value = validate(json.loads(raw.decode('utf-8')))
    sys.addaudithook(deny_network)
    engine = Engine(runtime)
    result = {'translations': [{'id': block['id'], 'text': translate_text(block['text'], value['targetLanguage'], engine)} for block in value['blocks']]}
    encoded = json.dumps(result, ensure_ascii=False).encode('utf-8')
    if len(encoded) > OUTPUT_LIMIT: raise ValueError('Output exceeds the safe bound')
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()

if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(type(error).__name__ + ': ' + str(error), file=sys.stderr)
        sys.exit(1)
