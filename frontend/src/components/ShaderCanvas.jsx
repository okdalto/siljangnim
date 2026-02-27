import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

// Default shaders (fallback before server sends data)
const DEFAULT_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const DEFAULT_FRAG = `
uniform float u_time;
varying vec2 vUv;
void main() {
  vec3 color = 0.5 + 0.5 * cos(u_time + vUv.xyx + vec3(0.0, 2.0, 4.0));
  gl_FragColor = vec4(color, 1.0);
}
`;

function ShaderMesh({ vertexShader, fragmentShader, pipeline }) {
  const meshRef = useRef();
  const materialRef = useRef();

  const uniforms = useMemo(
    () => ({
      u_time: { value: 0 },
      u_resolution: { value: new THREE.Vector2(1, 1) },
    }),
    []
  );

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.u_time.value = state.clock.elapsedTime;
    }
  });

  const mode = pipeline?.mode || "mesh";

  if (mode === "fullscreen_quad") {
    return (
      <mesh ref={meshRef}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
        />
      </mesh>
    );
  }

  // Default: mesh mode (box)
  return (
    <mesh ref={meshRef} rotation={[0.4, 0.6, 0]}>
      <boxGeometry args={[1.5, 1.5, 1.5]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}

function AutoResize({ containerRef }) {
  const { gl, camera } = useThree();

  useEffect(() => {
    if (!containerRef?.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          gl.setSize(width, height);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [containerRef, gl, camera]);

  return null;
}

export default function ShaderCanvas({ containerRef, shaders, pipeline }) {
  const vert = shaders?.vertex || DEFAULT_VERT;
  const frag = shaders?.fragment || DEFAULT_FRAG;
  const mode = pipeline?.mode || "mesh";

  // Use orthographic camera for fullscreen_quad mode
  const cameraProps =
    mode === "fullscreen_quad"
      ? { orthographic: true, camera: { zoom: 1, position: [0, 0, 1] } }
      : { camera: { position: [0, 0, 3], fov: 60 } };

  return (
    <Canvas
      {...cameraProps}
      style={{ position: "absolute", inset: 0 }}
      gl={{ antialias: true }}
    >
      <AutoResize containerRef={containerRef} />
      <ShaderMesh
        vertexShader={vert}
        fragmentShader={frag}
        pipeline={pipeline}
      />
    </Canvas>
  );
}
