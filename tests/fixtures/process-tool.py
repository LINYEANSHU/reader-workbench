import json, os, subprocess, sys, time
request = json.loads(sys.stdin.readline())
data = request['input']
if data.get('mode') == 'sleep':
    child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])
    with open(data['pidFile'], 'w', encoding='utf-8') as output:
        json.dump([os.getpid(), child.pid], output)
    time.sleep(60)
elif data.get('mode') == 'error':
    print(json.dumps({'version': 1, 'id': request['id'], 'error': {'message': 'example failure'}}))
else:
    print(json.dumps({'version': 1, 'id': request['id'], 'result': {'char_count': len(data.get('text', ''))}}))
