import json, sys
sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
request = json.loads(sys.stdin.readline())
text = request['input']['text']
print(json.dumps({'version': 1, 'id': request['id'], 'result': {'char_count': len(text), 'word_count': len(text.split())}}, ensure_ascii=False))
