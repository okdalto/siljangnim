/**
 * glslToWgsl — GLSL ES 3.00 → WGSL transpiler for Siljangnim.
 *
 * Converts #version 300 es fragment and vertex shaders to WGSL,
 * covering the common patterns used in generative graphics:
 * raymarching, SDF, noise, post-processing, etc.
 *
 * Exports:
 *   - transpileFragmentGLSL(glslSource) → { wgsl, uniforms, textures, errors }
 *   - transpileVertexGLSL(glslSource)   → { wgsl, attributes, uniforms, errors }
 *   - transpileGLSL(glslSource, type)   → dispatches to fragment or vertex
 */

// ─── Type Mappings ──────────────────────────────────────────

const TYPE_MAP = {
  float: "f32",
  int: "i32",
  uint: "u32",
  bool: "bool",
  void: "",
  vec2: "vec2f",
  vec3: "vec3f",
  vec4: "vec4f",
  ivec2: "vec2i",
  ivec3: "vec3i",
  ivec4: "vec4i",
  uvec2: "vec2u",
  uvec3: "vec3u",
  uvec4: "vec4u",
  bvec2: "vec2<bool>",
  bvec3: "vec3<bool>",
  bvec4: "vec4<bool>",
  mat2: "mat2x2f",
  mat3: "mat3x3f",
  mat4: "mat4x4f",
  sampler2D: "__sampler2D__",
  samplerCube: "__samplerCube__",
};

/** Size in bytes for uniform struct alignment */
const TYPE_SIZE = {
  f32: 4,
  i32: 4,
  u32: 4,
  bool: 4,
  vec2f: 8,
  vec3f: 12,
  vec4f: 16,
  vec2i: 8,
  vec3i: 12,
  vec4i: 16,
  vec2u: 8,
  vec3u: 12,
  vec4u: 16,
  mat2x2f: 16,
  mat3x3f: 48,
  mat4x4f: 64,
};

/** Alignment requirement for each type */
const TYPE_ALIGN = {
  f32: 4,
  i32: 4,
  u32: 4,
  bool: 4,
  vec2f: 8,
  vec3f: 16,
  vec4f: 16,
  vec2i: 8,
  vec3i: 16,
  vec4i: 16,
  vec2u: 8,
  vec3u: 16,
  vec4u: 16,
  mat2x2f: 8,
  mat3x3f: 16,
  mat4x4f: 16,
};

// ─── Built-in Function Mappings ─────────────────────────────

/**
 * Functions that map 1:1 (same name, same args)
 */
const DIRECT_FUNCTION_MAP = {
  abs: "abs",
  sign: "sign",
  floor: "floor",
  ceil: "ceil",
  round: "round",
  fract: "fract",
  sqrt: "sqrt",
  exp: "exp",
  exp2: "exp2",
  log: "log",
  log2: "log2",
  pow: "pow",
  min: "min",
  max: "max",
  clamp: "clamp",
  mix: "mix",
  step: "step",
  smoothstep: "smoothstep",
  length: "length",
  distance: "distance",
  dot: "dot",
  cross: "cross",
  normalize: "normalize",
  reflect: "reflect",
  refract: "refract",
  sin: "sin",
  cos: "cos",
  tan: "tan",
  asin: "asin",
  acos: "acos",
  sinh: "sinh",
  cosh: "cosh",
  tanh: "tanh",
  radians: "radians",
  degrees: "degrees",
  determinant: "determinant",
  transpose: "transpose",
};

/**
 * Functions that need renaming (different name, same signature)
 */
const RENAME_FUNCTION_MAP = {
  inversesqrt: "inverseSqrt",
  dFdx: "dpdx",
  dFdy: "dpdy",
  fwidth: "fwidth",
};

// ─── Helpers ────────────────────────────────────────────────

function mapType(glslType) {
  return TYPE_MAP[glslType] || glslType;
}

/**
 * Convert a GLSL type used in constructor position to its WGSL equivalent.
 * e.g. vec3(...) → vec3f(...)
 */
function mapConstructorType(name) {
  return TYPE_MAP[name] || name;
}

/**
 * Find matching closing parenthesis from a position after '('.
 */
function findMatchingParen(str, openPos) {
  let depth = 1;
  for (let i = openPos + 1; i < str.length; i++) {
    if (str[i] === "(") depth++;
    else if (str[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Split function arguments respecting nested parens/brackets.
 */
function splitArgs(argsStr) {
  const args = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

// ─── Parsing Phase ──────────────────────────────────────────

/**
 * Parse GLSL source into a structured representation.
 */
function parseGLSL(source) {
  const result = {
    version: null,
    precision: [],
    uniforms: [],
    inputs: [],
    outputs: [],
    defines: [],
    structs: [],
    functions: [],
    mainBody: "",
    rawLines: [],
    errors: [],
  };

  // Normalize line endings
  const lines = source.replace(/\r\n/g, "\n").split("\n");

  // Pre-process: collect #version, #define, precision, and strip them
  const codeLines = [];
  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("#version")) {
      result.version = trimmed;
      continue;
    }
    if (trimmed.startsWith("precision ")) {
      result.precision.push(trimmed);
      continue;
    }
    if (trimmed.startsWith("#define ")) {
      const match = trimmed.match(/^#define\s+(\w+)(?:\s+(.+))?$/);
      if (match) {
        result.defines.push({ name: match[1], value: match[2] || "" });
      }
      continue;
    }
    // Strip other preprocessor directives (but warn)
    if (trimmed.startsWith("#")) {
      if (!trimmed.startsWith("#ifdef") && !trimmed.startsWith("#ifndef") &&
          !trimmed.startsWith("#endif") && !trimmed.startsWith("#else") &&
          !trimmed.startsWith("#if ") && !trimmed.startsWith("#elif")) {
        result.errors.push(`Unsupported preprocessor directive: ${trimmed}`);
      } else {
        result.errors.push(`Preprocessor conditional not supported: ${trimmed}`);
      }
      continue;
    }

    codeLines.push(line);
  }

  // Join back to parse declarations
  const code = codeLines.join("\n");

  // Extract uniform declarations
  const uniformRe = /^\s*uniform\s+(\w+)\s+(\w+)\s*(?:\[(\d+)\])?\s*;/gm;
  let m;
  while ((m = uniformRe.exec(code)) !== null) {
    result.uniforms.push({
      type: m[1],
      name: m[2],
      arraySize: m[3] ? parseInt(m[3]) : null,
    });
  }

  // Extract in declarations
  const inRe = /^\s*(?:(?:flat|smooth|noperspective)\s+)?in\s+(\w+)\s+(\w+)\s*;/gm;
  while ((m = inRe.exec(code)) !== null) {
    result.inputs.push({ type: m[1], name: m[2] });
  }

  // Extract out declarations
  const outRe = /^\s*(?:(?:flat|smooth|noperspective)\s+)?out\s+(\w+)\s+(\w+)\s*;/gm;
  while ((m = outRe.exec(code)) !== null) {
    result.outputs.push({ type: m[1], name: m[2] });
  }

  // Extract struct definitions
  const structRe = /\bstruct\s+(\w+)\s*\{([^}]*)\}\s*;/g;
  while ((m = structRe.exec(code)) !== null) {
    const members = [];
    const memberRe = /(\w+)\s+(\w+)\s*(?:\[(\d+)\])?\s*;/g;
    let mm;
    while ((mm = memberRe.exec(m[2])) !== null) {
      members.push({ type: mm[1], name: mm[2], arraySize: mm[3] ? parseInt(mm[3]) : null });
    }
    result.structs.push({ name: m[1], members });
  }

  // Extract functions (including main)
  // We do a brace-matching approach
  const funcRe = /\b(\w+)\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
  while ((m = funcRe.exec(code)) !== null) {
    const returnType = m[1];
    const funcName = m[2];
    const params = m[3];
    const braceStart = m.index + m[0].length - 1;

    // Find matching closing brace
    let depth = 1;
    let i = braceStart + 1;
    while (i < code.length && depth > 0) {
      if (code[i] === "{") depth++;
      else if (code[i] === "}") depth--;
      i++;
    }
    const body = code.substring(braceStart + 1, i - 1);

    if (funcName === "main") {
      result.mainBody = body;
    } else {
      // Skip if this is a uniform/in/out/struct keyword
      if (["uniform", "in", "out", "struct", "if", "for", "while", "else", "switch"].includes(returnType)) {
        continue;
      }
      result.functions.push({
        returnType,
        name: funcName,
        params,
        body,
      });
    }
  }

  return result;
}

// ─── Code Transformation ────────────────────────────────────

/**
 * Transform GLSL code body to WGSL.
 * Handles type conversions, function renaming, syntax differences.
 */
function transformCode(code, ctx) {
  let result = code;

  // Replace type constructors: vec3(...) → vec3f(...)
  // Must handle nested constructors, so we do multiple passes
  const constructorTypes = [
    "vec2", "vec3", "vec4",
    "ivec2", "ivec3", "ivec4",
    "uvec2", "uvec3", "uvec4",
    "bvec2", "bvec3", "bvec4",
    "mat2", "mat3", "mat4",
    "float", "int", "uint",
  ];

  for (const t of constructorTypes) {
    // Replace type constructors: type(...) → wgslType(...)
    // But don't replace when it's part of a longer identifier
    const wgslT = mapConstructorType(t);
    // For float(x) → f32(x), int(x) → i32(x)
    const re = new RegExp(`\\b${t}\\s*\\(`, "g");
    result = result.replace(re, `${wgslT}(`);
  }

  // Replace standalone type keywords in declarations
  // e.g. "float x = ..." → "var x: f32 = ..."
  // This is handled separately in transformDeclarations

  // Replace renamed built-in functions
  for (const [glsl, wgsl] of Object.entries(RENAME_FUNCTION_MAP)) {
    const re = new RegExp(`\\b${glsl}\\s*\\(`, "g");
    result = result.replace(re, `${wgsl}(`);
  }

  // mod(a, b) → (a % b) for scalars, or (a - floor(a / b) * b) for generality
  // We use the fmod-like approach: (a % b) which works for f32 in WGSL
  result = replaceFunction(result, "mod", (args) => {
    if (args.length === 2) {
      return `(${args[0]} % ${args[1]})`;
    }
    return `(${args[0]} % ${args[1]})`;
  });

  // atan with 2 args → atan2
  result = replaceFunction(result, "atan", (args) => {
    if (args.length === 2) {
      return `atan2(${args[0]}, ${args[1]})`;
    }
    // Single arg atan stays as atan
    return `atan(${args[0]})`;
  });

  // texture(sampler, uv) → textureSample(tex_name, samp_name, uv)
  result = replaceFunction(result, "texture", (args) => {
    if (args.length >= 2) {
      const samplerName = args[0].trim();
      const texName = ctx.textureMap?.[samplerName] || samplerName;
      const sampName = ctx.samplerMap?.[samplerName] || `${samplerName}_sampler`;
      return `textureSample(${texName}, ${sampName}, ${args.slice(1).join(", ")})`;
    }
    return `textureSample(${args.join(", ")})`;
  });

  // texelFetch(sampler, ivec2, lod) → textureLoad(tex, coords, level)
  result = replaceFunction(result, "texelFetch", (args) => {
    if (args.length >= 3) {
      const samplerName = args[0].trim();
      const texName = ctx.textureMap?.[samplerName] || samplerName;
      return `textureLoad(${texName}, ${args[1]}, ${args[2]})`;
    }
    return `textureLoad(${args.join(", ")})`;
  });

  // textureSize(sampler, lod) → textureDimensions(tex, level)
  result = replaceFunction(result, "textureSize", (args) => {
    if (args.length >= 1) {
      const samplerName = args[0].trim();
      const texName = ctx.textureMap?.[samplerName] || samplerName;
      const lod = args.length >= 2 ? args[1] : "0";
      return `textureDimensions(${texName}, ${lod})`;
    }
    return `textureDimensions(${args.join(", ")})`;
  });

  // lessThan(a, b) → (a < b) — component-wise, WGSL handles this with < on vectors
  result = replaceFunction(result, "lessThan", (args) => `(${args[0]} < ${args[1]})`);
  result = replaceFunction(result, "lessThanEqual", (args) => `(${args[0]} <= ${args[1]})`);
  result = replaceFunction(result, "greaterThan", (args) => `(${args[0]} > ${args[1]})`);
  result = replaceFunction(result, "greaterThanEqual", (args) => `(${args[0]} >= ${args[1]})`);
  result = replaceFunction(result, "equal", (args) => `(${args[0]} == ${args[1]})`);
  result = replaceFunction(result, "notEqual", (args) => `(${args[0]} != ${args[1]})`);

  // mat3(mat4) → extract 3x3 from mat4
  // This is a special case constructor; we leave it as mat3x3f() which is valid

  // Replace gl_FragCoord with the parameter name
  if (ctx.useFragCoord) {
    result = result.replace(/\bgl_FragCoord\b/g, ctx.fragCoordName || "frag_coord");
  }

  // Replace uniform access: u_time → u.time, u_resolution → u.resolution
  if (ctx.uniformRenames) {
    for (const [glslName, wgslAccess] of Object.entries(ctx.uniformRenames)) {
      const re = new RegExp(`\\b${escapeRegex(glslName)}\\b`, "g");
      result = result.replace(re, wgslAccess);
    }
  }

  return result;
}

/**
 * Replace a named function call, allowing custom transform of arguments.
 * Handles nested parentheses correctly.
 */
function replaceFunction(code, funcName, transformer) {
  const pattern = new RegExp(`\\b${funcName}\\s*\\(`, "g");
  let result = "";
  let lastEnd = 0;
  let match;

  // Reset regex
  pattern.lastIndex = 0;

  while ((match = pattern.exec(code)) !== null) {
    // Check it's not part of a larger identifier
    const charBefore = match.index > 0 ? code[match.index - 1] : " ";
    if (/[a-zA-Z0-9_]/.test(charBefore)) {
      continue;
    }

    const openParen = match.index + match[0].length - 1;
    const closeParen = findMatchingParen(code, openParen);
    if (closeParen === -1) {
      // Can't find matching paren, skip
      continue;
    }

    const argsStr = code.substring(openParen + 1, closeParen);
    const args = splitArgs(argsStr);
    const replacement = transformer(args);

    result += code.substring(lastEnd, match.index);
    result += replacement;
    lastEnd = closeParen + 1;

    // Update regex position
    pattern.lastIndex = lastEnd;
  }

  result += code.substring(lastEnd);
  return result;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Transform a local variable declaration from GLSL to WGSL.
 * "float x = 1.0;" → "var x: f32 = 1.0;"
 * "const vec3 c = vec3(1);" → "const c: vec3f = vec3f(1);"
 */
function transformDeclarations(code) {
  let result = code;

  const allTypes = Object.keys(TYPE_MAP).join("|");
  // Match: [const] type name [= expr];
  // Also handle: type name = expr, name2 = expr2; (multiple declarations — rare but possible)
  const declRe = new RegExp(
    `^(\\s*)(const\\s+)?((?:${allTypes})\\b)\\s+(\\w+)(\\s*(?:\\[[^\\]]*\\])?)\\s*(=\\s*[^;]+)?;`,
    "gm"
  );

  result = result.replace(declRe, (full, indent, constKw, glslType, name, arraySuffix, init) => {
    const wgslType = mapType(glslType);
    // Skip sampler types in local declarations
    if (wgslType.startsWith("__")) return full;

    const keyword = constKw ? "const" : "var";
    const initPart = init ? ` ${init.trim()}` : "";
    const arrPart = arraySuffix ? arraySuffix.trim() : "";

    if (arrPart) {
      // array declaration: float arr[3] → var arr: array<f32, 3>
      const sizeMatch = arrPart.match(/\[(\d+)\]/);
      if (sizeMatch) {
        return `${indent}${keyword} ${name}: array<${wgslType}, ${sizeMatch[1]}>${initPart};`;
      }
    }

    return `${indent}${keyword} ${name}: ${wgslType}${initPart};`;
  });

  return result;
}

/**
 * Transform function parameter declarations.
 * "float x, vec3 y" → "x: f32, y: vec3f"
 */
function transformParams(paramsStr) {
  if (!paramsStr.trim()) return "";
  const params = splitArgs(paramsStr);
  return params.map((p) => {
    const parts = p.trim().split(/\s+/);
    if (parts.length >= 2) {
      // Handle qualifiers like "in", "out", "inout"
      let qualifier = "";
      let type, name;
      if (parts[0] === "in" || parts[0] === "out" || parts[0] === "inout") {
        // WGSL doesn't have out/inout params — use ptr for inout
        qualifier = parts[0] === "inout" ? "/* inout */ " : "";
        type = parts[1];
        name = parts[2] || parts[1]; // fallback
      } else {
        type = parts[0];
        name = parts[1];
      }
      const wgslType = mapType(type);
      return `${qualifier}${name}: ${wgslType}`;
    }
    return p; // fallback
  }).join(", ");
}

/**
 * Transform a function return type.
 */
function transformReturnType(glslType) {
  if (glslType === "void") return "";
  return ` -> ${mapType(glslType)}`;
}

// ─── Uniform Struct Builder ─────────────────────────────────

/**
 * Build a WGSL Uniforms struct with proper alignment/padding.
 * Returns { structCode, memberMap, nextBinding }
 */
function buildUniformStruct(uniforms, startBinding = 0) {
  // Separate sampler uniforms from value uniforms
  const valueUniforms = [];
  const textureUniforms = [];

  for (const u of uniforms) {
    if (u.type === "sampler2D" || u.type === "samplerCube") {
      textureUniforms.push(u);
    } else {
      valueUniforms.push(u);
    }
  }

  let structCode = "";
  const memberMap = {}; // glslName → wgsl access (e.g. "u.time")
  const textureBindings = [];
  let nextBinding = startBinding;

  // Build the uniform struct for value uniforms
  if (valueUniforms.length > 0) {
    // Sort by alignment (largest first) to minimize padding
    const sorted = [...valueUniforms].sort((a, b) => {
      const alignA = TYPE_ALIGN[mapType(a.type)] || 4;
      const alignB = TYPE_ALIGN[mapType(b.type)] || 4;
      return alignB - alignA;
    });

    let members = [];
    let offset = 0;
    let padIdx = 0;

    for (const u of sorted) {
      const wgslType = mapType(u.type);
      const align = TYPE_ALIGN[wgslType] || 4;
      const size = TYPE_SIZE[wgslType] || 4;

      // Add padding if needed
      const misalignment = offset % align;
      if (misalignment !== 0) {
        const padBytes = align - misalignment;
        const padCount = padBytes / 4;
        for (let p = 0; p < padCount; p++) {
          members.push(`  _pad${padIdx}: f32,`);
          padIdx++;
          offset += 4;
        }
      }

      // Strip "u_" prefix for WGSL member name
      const memberName = u.name.startsWith("u_") ? u.name.substring(2) : u.name;

      if (u.arraySize) {
        members.push(`  ${memberName}: array<${wgslType}, ${u.arraySize}>,`);
        offset += size * u.arraySize;
      } else {
        members.push(`  ${memberName}: ${wgslType},`);
        offset += size;
      }

      memberMap[u.name] = `u.${memberName}`;
    }

    structCode += `struct Uniforms {\n${members.join("\n")}\n};\n`;
    structCode += `@group(0) @binding(${nextBinding}) var<uniform> u: Uniforms;\n`;
    nextBinding++;
  }

  // Build texture/sampler bindings
  const textureMap = {};
  const samplerMap = {};

  for (const t of textureUniforms) {
    const texType = t.type === "samplerCube" ? "texture_cube<f32>" : "texture_2d<f32>";

    // sampler binding
    samplerMap[t.name] = `${t.name}_sampler`;
    structCode += `@group(0) @binding(${nextBinding}) var ${t.name}_sampler: sampler;\n`;
    nextBinding++;

    // texture binding
    textureMap[t.name] = t.name;
    structCode += `@group(0) @binding(${nextBinding}) var ${t.name}: ${texType};\n`;
    nextBinding++;

    textureBindings.push({
      name: t.name,
      type: t.type === "samplerCube" ? "cube" : "2d",
      samplerBinding: nextBinding - 2,
      textureBinding: nextBinding - 1,
    });
  }

  return {
    structCode,
    memberMap,
    textureMap,
    samplerMap,
    textureBindings,
    nextBinding,
  };
}

// ─── Fragment Shader Transpiler ─────────────────────────────

/**
 * Transpile a GLSL ES 3.00 fragment shader to WGSL.
 *
 * @param {string} glslSource — Full GLSL fragment shader source
 * @returns {{ wgsl: string, uniforms: Array, textures: Array, errors: string[] }}
 */
export function transpileFragmentGLSL(glslSource) {
  const errors = [];

  try {
    const parsed = parseGLSL(glslSource);
    errors.push(...parsed.errors);

    // Build uniform struct
    const uniformInfo = buildUniformStruct(parsed.uniforms);

    // Check if gl_FragCoord is used
    const usesFragCoord = /\bgl_FragCoord\b/.test(glslSource);

    // Find the output variable name (usually fragColor)
    const fragOutput = parsed.outputs.find(
      (o) => mapType(o.type) === "vec4f" || o.type === "vec4"
    );
    const fragOutputName = fragOutput ? fragOutput.name : "fragColor";

    // Build transformation context
    const ctx = {
      useFragCoord: usesFragCoord,
      fragCoordName: "frag_coord",
      uniformRenames: uniformInfo.memberMap,
      textureMap: uniformInfo.textureMap,
      samplerMap: uniformInfo.samplerMap,
    };

    // Build the WGSL output
    let wgsl = "";

    // Defines → const
    for (const d of parsed.defines) {
      if (d.value) {
        // Try to determine if it's a number
        const val = d.value.trim();
        wgsl += `const ${d.name}: f32 = ${transformCode(val, ctx)};\n`;
      }
      // Valueless defines are ignored (flags) — could be handled with if/else
    }
    if (parsed.defines.length > 0) wgsl += "\n";

    // Struct definitions
    for (const s of parsed.structs) {
      wgsl += `struct ${s.name} {\n`;
      for (const m of s.members) {
        const wgslType = mapType(m.type);
        if (m.arraySize) {
          wgsl += `  ${m.name}: array<${wgslType}, ${m.arraySize}>,\n`;
        } else {
          wgsl += `  ${m.name}: ${wgslType},\n`;
        }
      }
      wgsl += `};\n\n`;
    }

    // Uniform struct + texture bindings
    if (uniformInfo.structCode) {
      wgsl += uniformInfo.structCode + "\n";
    }

    // Helper functions
    for (const fn of parsed.functions) {
      const wgslReturnType = transformReturnType(fn.returnType);
      const wgslParams = transformParams(fn.params);
      let body = fn.body;

      // Transform the body
      body = transformCode(body, ctx);
      body = transformDeclarations(body);

      wgsl += `fn ${fn.name}(${wgslParams})${wgslReturnType} {\n${body}\n}\n\n`;
    }

    // Main function → @fragment fn fs_main
    let mainBody = parsed.mainBody;
    mainBody = transformCode(mainBody, ctx);
    mainBody = transformDeclarations(mainBody);

    // Replace "fragColor = expr;" at the end with "return expr;"
    // Handle assignment to the output variable
    mainBody = transformFragOutput(mainBody, fragOutputName);

    // Build parameter list
    const params = [];
    // Add varyings as @location inputs
    let locIdx = 0;
    for (const inp of parsed.inputs) {
      const wgslType = mapType(inp.type);
      // Strip "v_" prefix for parameter name clarity, but keep original for code references
      params.push(`@location(${locIdx}) ${inp.name}: ${wgslType}`);
      locIdx++;
    }

    // Add gl_FragCoord if used
    if (usesFragCoord) {
      params.push(`@builtin(position) ${ctx.fragCoordName}: vec4f`);
    }

    const paramStr = params.length > 0 ? params.join(",\n  ") : "";
    const fnSig = paramStr
      ? `@fragment\nfn fs_main(\n  ${paramStr}\n) -> @location(0) vec4f`
      : `@fragment\nfn fs_main() -> @location(0) vec4f`;

    wgsl += `${fnSig} {\n${mainBody}\n}\n`;

    // Collect uniform info for the caller
    const uniformList = parsed.uniforms
      .filter((u) => u.type !== "sampler2D" && u.type !== "samplerCube")
      .map((u) => ({
        name: u.name,
        type: mapType(u.type),
        wgslName: u.name.startsWith("u_") ? u.name.substring(2) : u.name,
      }));

    return {
      wgsl,
      uniforms: uniformList,
      textures: uniformInfo.textureBindings,
      errors,
    };
  } catch (e) {
    errors.push(`Transpiler error: ${e.message}`);
    return {
      wgsl: `// Transpilation failed: ${e.message}\n`,
      uniforms: [],
      textures: [],
      errors,
    };
  }
}

/**
 * Transform fragment output assignments.
 * Replaces `fragColor = expr;` with `return expr;`.
 * Handles intermediate assignments by declaring a local var.
 */
function transformFragOutput(body, outputName) {
  // Count how many times the output is assigned
  const assignRe = new RegExp(`\\b${escapeRegex(outputName)}\\s*=`, "g");
  const assignments = body.match(assignRe);

  if (!assignments || assignments.length === 0) {
    return body;
  }

  if (assignments.length === 1) {
    // Single assignment — just convert to return
    const re = new RegExp(
      `(\\s*)${escapeRegex(outputName)}\\s*=\\s*([^;]+);`,
      ""
    );
    return body.replace(re, "$1return $2;");
  }

  // Multiple assignments — declare a local var and return at the end
  let result = `  var ${outputName}: vec4f;\n` + body;

  // Make sure the last statement returns
  // Find the last assignment and check if it's really the last statement
  const lines = result.split("\n");
  const lastAssignIdx = findLastIndex(lines, (l) =>
    new RegExp(`\\b${escapeRegex(outputName)}\\s*=`).test(l)
  );

  if (lastAssignIdx >= 0 && lastAssignIdx === lines.length - 1 ||
      isTrailingAssignment(lines, lastAssignIdx, outputName)) {
    // Append return
    result += `\n  return ${outputName};`;
  } else {
    result += `\n  return ${outputName};`;
  }

  return result;
}

function findLastIndex(arr, pred) {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i])) return i;
  }
  return -1;
}

function isTrailingAssignment(lines, idx, name) {
  // Check if everything after idx is whitespace/empty
  for (let i = idx + 1; i < lines.length; i++) {
    if (lines[i].trim()) return false;
  }
  return true;
}

// ─── Vertex Shader Transpiler ───────────────────────────────

/**
 * Transpile a GLSL ES 3.00 vertex shader to WGSL.
 *
 * @param {string} glslSource — Full GLSL vertex shader source
 * @returns {{ wgsl: string, attributes: Array, uniforms: Array, errors: string[] }}
 */
export function transpileVertexGLSL(glslSource) {
  const errors = [];

  try {
    const parsed = parseGLSL(glslSource);
    errors.push(...parsed.errors);

    // Build uniform struct
    const uniformInfo = buildUniformStruct(parsed.uniforms);

    // Build the output struct
    const outputMembers = [];
    outputMembers.push("  @builtin(position) position: vec4f,");

    let varyingLocIdx = 0;
    for (const out of parsed.outputs) {
      const wgslType = mapType(out.type);
      outputMembers.push(`  @location(${varyingLocIdx}) ${out.name}: ${wgslType},`);
      varyingLocIdx++;
    }

    // Build transformation context
    const ctx = {
      useFragCoord: false,
      uniformRenames: uniformInfo.memberMap,
      textureMap: uniformInfo.textureMap,
      samplerMap: uniformInfo.samplerMap,
    };

    let wgsl = "";

    // Defines → const
    for (const d of parsed.defines) {
      if (d.value) {
        wgsl += `const ${d.name}: f32 = ${transformCode(d.value.trim(), ctx)};\n`;
      }
    }
    if (parsed.defines.length > 0) wgsl += "\n";

    // Struct definitions
    for (const s of parsed.structs) {
      wgsl += `struct ${s.name} {\n`;
      for (const m of s.members) {
        const wgslType = mapType(m.type);
        wgsl += `  ${m.name}: ${wgslType},\n`;
      }
      wgsl += `};\n\n`;
    }

    // Uniform bindings
    if (uniformInfo.structCode) {
      wgsl += uniformInfo.structCode + "\n";
    }

    // VSOutput struct
    wgsl += `struct VSOutput {\n${outputMembers.join("\n")}\n};\n\n`;

    // Helper functions
    for (const fn of parsed.functions) {
      const wgslReturnType = transformReturnType(fn.returnType);
      const wgslParams = transformParams(fn.params);
      let body = fn.body;
      body = transformCode(body, ctx);
      body = transformDeclarations(body);
      wgsl += `fn ${fn.name}(${wgslParams})${wgslReturnType} {\n${body}\n}\n\n`;
    }

    // Build vertex attribute params
    const attrParams = [];
    let attrLocIdx = 0;
    const attributes = [];
    for (const inp of parsed.inputs) {
      const wgslType = mapType(inp.type);
      attrParams.push(`@location(${attrLocIdx}) ${inp.name}: ${wgslType}`);
      attributes.push({
        name: inp.name,
        type: wgslType,
        location: attrLocIdx,
      });
      attrLocIdx++;
    }

    // Transform main body
    let mainBody = parsed.mainBody;
    mainBody = transformCode(mainBody, ctx);
    mainBody = transformDeclarations(mainBody);

    // Replace gl_Position = expr; → out.position = expr;
    mainBody = mainBody.replace(/\bgl_Position\b/g, "out.position");

    // Replace output variable assignments: v_uv = expr; → out.v_uv = expr;
    for (const out of parsed.outputs) {
      const re = new RegExp(`\\b${escapeRegex(out.name)}\\b(?=\\s*=)`, "g");
      mainBody = mainBody.replace(re, `out.${out.name}`);
      // Also replace reads of the output var that aren't assignments
      // (In vertex shaders, reading back an out var should read from out.name)
      const readRe = new RegExp(`(?<!out\\.)\\b${escapeRegex(out.name)}\\b(?!\\s*=)`, "g");
      mainBody = mainBody.replace(readRe, `out.${out.name}`);
    }

    // Add "var out: VSOutput;" at the beginning and "return out;" at the end
    mainBody = `  var out: VSOutput;\n${mainBody}\n  return out;`;

    const paramStr = attrParams.length > 0 ? attrParams.join(",\n  ") : "";
    const fnSig = paramStr
      ? `@vertex\nfn vs_main(\n  ${paramStr}\n) -> VSOutput`
      : `@vertex\nfn vs_main() -> VSOutput`;

    wgsl += `${fnSig} {\n${mainBody}\n}\n`;

    const uniformList = parsed.uniforms
      .filter((u) => u.type !== "sampler2D" && u.type !== "samplerCube")
      .map((u) => ({
        name: u.name,
        type: mapType(u.type),
        wgslName: u.name.startsWith("u_") ? u.name.substring(2) : u.name,
      }));

    return {
      wgsl,
      attributes,
      uniforms: uniformList,
      errors,
    };
  } catch (e) {
    errors.push(`Transpiler error: ${e.message}`);
    return {
      wgsl: `// Transpilation failed: ${e.message}\n`,
      attributes: [],
      uniforms: [],
      errors,
    };
  }
}

// ─── Dispatcher ─────────────────────────────────────────────

/**
 * Transpile a GLSL ES 3.00 shader to WGSL.
 *
 * @param {string} glslSource — Full GLSL shader source
 * @param {"fragment"|"vertex"} type — Shader stage
 * @returns {Object} — Result from transpileFragmentGLSL or transpileVertexGLSL
 */
export function transpileGLSL(glslSource, type) {
  if (type === "vertex") {
    return transpileVertexGLSL(glslSource);
  }
  if (type === "fragment") {
    return transpileFragmentGLSL(glslSource);
  }

  // Try to auto-detect from source
  if (/\bgl_Position\b/.test(glslSource) || /\b(in|attribute)\s+vec[23]\s+a_/.test(glslSource)) {
    return transpileVertexGLSL(glslSource);
  }
  return transpileFragmentGLSL(glslSource);
}
