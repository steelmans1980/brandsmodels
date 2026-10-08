"""One-off: move downloaded photos that no published record uses out of assets/photos (deployed) into
pipeline/candidates/photos, and rewrite every stored reference to them. Only files added on this branch are moved."""
import json
import os
import shutil
import sys

from . import cache, config


def main(names):
    old = {f'assets/photos/{n}': f'pipeline/candidates/photos/{n}' for n in names}
    os.makedirs(config.CANDIDATES, exist_ok=True)
    for a, b in old.items():
        if os.path.exists(os.path.join(config.ROOT, a)):
            shutil.move(os.path.join(config.ROOT, a), os.path.join(config.ROOT, b))
    sub = lambda s: old.get(s, s)

    def fix(o):
        if isinstance(o, dict):
            return {k: fix(v) for k, v in o.items()}
        if isinstance(o, list):
            return [fix(v) for v in o]
        return sub(o) if isinstance(o, str) else o

    st = cache.search_store()
    for ns in [r[0] for r in st.db.execute("select distinct ns from kv where ns like 'result:%'")]:
        for k, v in st.items(ns):
            nv = fix(v)
            if nv != v:
                st.put(ns, k, nv)
    ps = cache.pages_store()
    for k, v in ps.items('image'):
        nv = fix(v)
        if nv != v:
            ps.put('image', k, nv)
    for k, h in list(ps.items('dhash')):
        if k in old:
            ps.delete('dhash', k)
            ps.put('dhash', old[k], h)
    for f in os.listdir(config.RESULTS):
        p = os.path.join(config.RESULTS, f)
        if f.endswith('.txt'):
            lines = open(p).read().split('\n')
            open(p, 'w').write('\n'.join(sub(x.strip()) if x.strip() else x for x in lines))
        elif f.endswith('.json') or f.endswith('.jsonl'):
            t = open(p).read()
            if not any(a in t for a in old):
                continue
            if f.endswith('.jsonl'):
                open(p, 'w').write(''.join(json.dumps(fix(json.loads(x)), ensure_ascii=False) + '\n' for x in t.splitlines() if x.strip()))
            else:
                json.dump(fix(json.loads(t)), open(p, 'w'), ensure_ascii=False, indent=1)
    print(f'moved {len(old)} files')


if __name__ == '__main__':
    main([x.strip() for x in open(sys.argv[1]) if x.strip()])
