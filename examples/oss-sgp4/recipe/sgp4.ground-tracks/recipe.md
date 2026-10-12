---
id: sgp4.ground-tracks
version: 1
title: Satellite orbits and ground tracks from TLEs (sgp4)
capability: simulate satellite orbit propagation tle ground track earth json
tier: C
kind: python
packages:
- sgp4==2.27
source:
  name: python-sgp4
  repo: https://github.com/brandon-rhodes/python-sgp4
  license: MIT
io:
  inputs: []
  outputs:
  - name: tracks.json
    media: json
verify:
  params:
    hours: 1
    step_s: 120
  expect_outputs:
  - tracks.json
platforms:
  mac-arm64:
    status: verified
    tested: '2026-10-12'
    version: 1
status: verified
origin: local
updated: '2026-10-12'
---

# Satellite orbits and ground tracks from TLEs (sgp4)

## Setup

Nothing beyond the packages in the front matter.

## Run

Runs with the packages above. Reads `in/` (inputs, and `in/params.json` when given), writes results to `out/`.

```python
import json, math, os
from datetime import datetime, timedelta, timezone
from sgp4.api import Satrec, jday
P = json.load(open('in/params.json')) if os.path.exists('in/params.json') else {}
TLES = P.get('tles') or [
 ["ISS", "1 25544U 98067A   26284.17638745  .00009430  00000+0  18014-3 0  9995", "2 25544  51.6312  86.0933 0006713 248.1316 111.8959 15.48821882589734"],
 ["HST", "1 20580U 90037B   26283.95144126  .00008494  00000+0  26031-3 0  9996", "2 20580  28.4737   8.6621 0001735  14.6522 345.4124 15.31895111806335"],
 ["Tiangong", "1 48274U 21035A   26284.27662524  .00024573  00000+0  29211-3 0  9990", "2 48274  41.4698 336.9403 0000623  26.4858 333.6012 15.60571801311299"],
 ["NOAA 19", "1 33591U 09005A   26284.28182233  .00000041  00000+0  45441-4 0  9992", "2 33591  98.9412 355.1745 0014646  64.2634 296.0049 14.13488819910885"],
 ["Meteor-M 2", "1 40069U 14037A   26284.28802074  .00000142  00000+0  84222-4 0  9995", "2 40069  98.5278 256.0023 0006960  63.2912 296.8978 14.21489122635818"],
 ["GPS (Navstar 56)", "1 28474U 04045A   26284.06776792 -.00000076  00000+0  00000+0 0  9996", "2 28474  55.0610 320.2195 0173311 319.4198 107.8107  2.00560942160758"],
 ["Molniya 2-9", "1 07276U 74026A   26282.28395067 -.00000111  00000+0  00000+0 0  9993", "2 07276  64.3559   1.3266 6717092 261.7353  23.0859  2.45097212287818"],
]
sats = [(name, Satrec.twoline2rv(l1, l2)) for name, l1, l2 in TLES]
if P.get('start'):
    start = datetime.fromisoformat(P['start'].replace('Z', '+00:00'))
else:
    newest = max(s.jdsatepoch + s.jdsatepochF for _, s in sats)
    start = datetime(2000, 1, 1, 12, tzinfo=timezone.utc) + timedelta(days=newest - 2451545.0)
    start = start.replace(second=0, microsecond=0)
step = float(P.get('step_s', 30))
steps = int(float(P.get('hours', 6)) * 3600 / step) + 1
ER = 6378.137
def gmst(jd):
    t = (jd - 2451545.0) / 36525.0
    g = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * t * t - t ** 3 / 38710000.0
    return math.radians(g % 360.0)
out = []
for name, s in sats:
    xyz, ll = [], []
    for i in range(steps):
        when = start + timedelta(seconds=step * i)
        jd, fr = jday(when.year, when.month, when.day, when.hour, when.minute, when.second + when.microsecond / 1e6)
        err, r, v = s.sgp4(jd, fr)
        if err:
            raise SystemExit(f"{name}: sgp4 error {err} at {when.isoformat()}")
        th = gmst(jd + fr)
        x = r[0] * math.cos(th) + r[1] * math.sin(th)
        y = -r[0] * math.sin(th) + r[1] * math.cos(th)
        z = r[2]
        d = math.sqrt(x * x + y * y + z * z)
        xyz += [round(x / ER, 4), round(y / ER, 4), round(z / ER, 4)]
        ll += [round(math.degrees(math.asin(z / d)), 3), round(math.degrees(math.atan2(y, x)), 3)]
    out.append({"name": name, "period_min": round(2 * math.pi / s.no_kozai, 2), "inclination": round(math.degrees(s.inclo), 2), "xyz": xyz, "latlon": ll})
json.dump({"start": start.isoformat(), "step_s": step, "steps": steps, "satellites": out}, open('out/tracks.json', 'w'))
print(len(out), "satellites,", steps, "steps from", start.isoformat())
```

## Verify

Runs with the `verify` params in the front matter and writes every expected output.

## Notes

Params: hours, step_s, start (ISO UTC, default the newest TLE epoch), tles (list of [name, line1, line2]; defaults are CelesTrak elements from 2026-10-09..11 for ISS, HST, Tiangong, NOAA 19, Meteor-M 2, a GPS satellite and Molniya 2-9). Propagates with SGP4 and rotates TEME into an Earth-fixed frame with GMST (no polar motion; fine for drawing). tracks.json: start, step_s, steps, satellites as {name, period_min, inclination, xyz (flat Earth-fixed [x, y, z] in Earth radii, z = north pole), latlon (flat [lat, lon] degrees)}.
