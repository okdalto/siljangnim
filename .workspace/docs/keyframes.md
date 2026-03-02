# KEYFRAME ANIMATION STATE

The user can set keyframe animations on uniforms via the UI. Keyframes
override the static uniform value at runtime — the value animates over time.

Use `read_file(path="workspace_state.json")` to read the current keyframe/timeline state.
Use `write_file(path="workspace_state.json", content=...)` to modify it (e.g. add/remove keyframes,
change duration or loop).

## workspace_state.json schema

```json
{
  "version": 1,
  "keyframes": {
    "u_speed": [
      { "time": 0, "value": 0.5, "inTangent": 0, "outTangent": 0, "linear": false },
      { "time": 10, "value": 2.0, "inTangent": 0, "outTangent": 0, "linear": false }
    ]
  },
  "duration": 30,
  "loop": true
}
```

- `keyframes`: object mapping uniform names → sorted arrays of keyframe objects.
  - `time`: position in seconds on the timeline
  - `value`: the uniform value at that time
  - `inTangent` / `outTangent`: slope for cubic Hermite interpolation (0 = flat)
  - `linear`: if true, uses linear interpolation instead of cubic
- `duration`: total timeline length in seconds
- `loop`: whether the timeline loops

When creating animations, consider using keyframes for values that should
change over time rather than hardcoding time-based math in the shader.
When modifying scenes, always check `read_file(path="workspace_state.json")` first to see if
the user has existing keyframe animations that you should preserve or adapt.
