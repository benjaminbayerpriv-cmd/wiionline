import sys,json
d=json.load(sys.stdin)
if 'error' in d: print('ERROR',d['error'][:300]); sys.exit(1)
c=d['cfg']; s=d['samples']; warm=c.get('warmup',20)
w=[x for x in s if x['wall']>=warm]; f,l=w[0],w[-1]; dw=l['wall']-f['wall']; gs=(l['ticks']-f['ticks'])/l['tps']
print('%s | %s speed=%s cpu=%s jit=%s thread=%s | speedRatio=%.2f vi/s=%.1f jitRuns/s=%.2e compiled=%d | %s cores=%s' % (c.get('label','-'),c['video'],c['speed'],c['cpu'],c['jit'],c['thread'],gs/dw,(l['frameGen']-f['frameGen'])/dw,(l['jitRuns']-f['jitRuns'])/dw,l['jitCompiled']-f['jitCompiled'],d['ua'].split(' ')[-2] if 'ua' in d else '',d.get('cores')))
