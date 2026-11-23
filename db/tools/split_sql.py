"""Split a migration file into statements (respects $$ bodies and -- comments); print JSON array."""
import json, re, sys
src = open(sys.argv[1]).read()
src = re.sub(r'(?m)^\s*--.*$', '', src)
out, buf, in_dollar = [], [], False
i = 0
while i < len(src):
    if src.startswith('$$', i):
        in_dollar = not in_dollar; buf.append('$$'); i += 2; continue
    c = src[i]
    if c == ';' and not in_dollar:
        s = ''.join(buf).strip()
        if s: out.append(re.sub(r'\s+', ' ', s))
        buf = []
    else:
        buf.append(c)
    i += 1
s = ''.join(buf).strip()
if s: out.append(re.sub(r'\s+', ' ', s))
print(json.dumps(out, ensure_ascii=False))
