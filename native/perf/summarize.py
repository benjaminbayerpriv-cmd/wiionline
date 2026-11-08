"""Summarize a browser probe JSON. Counts are event counts, never FPS."""
import json
import re
import statistics
import sys

run = json.load(sys.stdin)
if 'error' in run:
    raise SystemExit(run['error'])
cfg = run['cfg']
samples = ([s for s in run['samples'] if s.get('guest', 0) >= cfg['warmupGuest']]
           if 'warmupGuest' in cfg else
           [s for s in run['samples'] if s['wall'] >= cfg.get('warmup', 20)])
if 'endGuest' in cfg:
    samples = [s for s in samples if s.get('guest', float('inf')) <= cfg['endGuest']]
if len(samples) < 2:
    raise SystemExit('too few warm samples')
first, last = samples[0], samples[-1]
wall = last['wall'] - first['wall']
guest = (last['ticks'] - first['ticks']) / last['tps']
print(f"{cfg.get('label','run')}: wall={wall:.2f}s guest={guest:.2f}s ratio={guest/wall:.3f} tps={last['tps']}")
for key in ('viScanouts', 'xfbCopies', 'drawBatches', 'rasterTriangles', 'jitRuns', 'jitCompiled'):
    if first.get(key) is None or last.get(key) is None:
        continue
    if any(a[key] > b[key] for a, b in zip(samples, samples[1:])):
        print(f"  {key}: nonmonotonic samples; rate invalid")
        continue
    delta = last[key] - first[key]
    print(f"  {key}: delta={delta} per_wall_s={delta/wall:.2f} per_guest_s={delta/guest:.2f}")
if cfg.get('distinct') and run.get('dist'):
    d = run['dist']
    print(f"  observed output changes: {d['distinct']} of {d['calls']} sampled VI generations")
    if d['gaps']:
        print(f"  change gap median={statistics.median(d['gaps']):.1f}ms")
for site, count, slow, total, maximum in re.findall(
        r'throttleprof:v=1,site=([^, ]+),count=(\d+),slow=(\d+),total=(\d+),max=(\d+)',
        run.get('timingStats', '')):
    if cfg.get('timingProfile'):
        print(f"  throttle {site}: calls={count} slow={slow} total={int(total)/1e6:.2f}s max={int(maximum)/1000:.1f}ms (whole run)")
