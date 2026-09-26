"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { primitiveMesh } from "@/core/assets/mesh";
import { pbrFor } from "@/core/assets/spec";
import { isA } from "@/core/roblox/classes";
import { walk, type RNode } from "@/core/roblox/instance";
import { rotationFromOrientation, type RValue } from "@/core/roblox/values";

export interface Scene3DProps {
  root?: RNode;
  glb?: Uint8Array;
  selectedId?: string;
  onSelect?: (id: string | undefined) => void;
  showGrid?: boolean;
  onStats?: (s: { parts: number; triangles: number; size: [number, number, number] }) => void;
  background?: "studio" | "transparent";
}

function partShape(n: RNode): "block" | "cylinder" | "sphere" | "wedge" | "cornerwedge" {
  if (n.className === "WedgePart") return "wedge";
  if (n.className === "CornerWedgePart") return "cornerwedge";
  const s = n.properties.Shape;
  if (s?.t === "Enum") return s.v === "Cylinder" ? "cylinder" : s.v === "Ball" ? "sphere" : s.v === "Wedge" ? "wedge" : s.v === "CornerWedge" ? "cornerwedge" : "block";
  return "block";
}

function matrixOf(n: RNode): THREE.Matrix4 {
  const cf = n.properties.CFrame;
  const pos = n.properties.Position?.t === "Vector3" ? n.properties.Position.v : cf?.t === "CFrame" ? cf.pos : [0, 0, 0];
  const rot = n.properties.Orientation?.t === "Vector3" ? rotationFromOrientation(n.properties.Orientation.v) : cf?.t === "CFrame" ? cf.rot : [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const m = new THREE.Matrix4();
  m.set(rot[0], rot[1], rot[2], pos[0], rot[3], rot[4], rot[5], pos[1], rot[6], rot[7], rot[8], pos[2], 0, 0, 0, 1);
  return m;
}

const colorOf = (v: RValue | undefined): THREE.Color => (v?.t === "Color3" ? new THREE.Color(v.v[0], v.v[1], v.v[2]) : new THREE.Color(0.64, 0.64, 0.65));
const num = (v: RValue | undefined, d: number) => (v && (v.t === "float" || v.t === "int") ? v.v : d);

export function Scene3D({ root, glb, selectedId, onSelect, showGrid = true, onStats, background = "studio" }: Scene3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    content: THREE.Group;
    helper?: THREE.BoxHelper;
    grid: THREE.GridHelper;
    render: () => void;
    framed: boolean;
  } | null>(null);

  // One renderer per mount.
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: background === "transparent", preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    if (background === "studio") {
      scene.background = new THREE.Color("#8fb6de");
      scene.fog = new THREE.Fog("#8fb6de", 600, 2200);
    }
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 5000);
    camera.position.set(24, 18, 24);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x3a3f47, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(60, 120, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, far: 500 });
    scene.add(sun);
    const grid = new THREE.GridHelper(512, 128, 0x5a6478, 0x46505f);
    (grid.material as THREE.Material).opacity = 0.35;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);
    const content = new THREE.Group();
    scene.add(content);
    let frame = 0;
    const render = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        controls.update();
        renderer.render(scene, camera);
      });
    };
    controls.addEventListener("change", render);
    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    state.current = { renderer, scene, camera, controls, content, grid, render, framed: false };
    // Damping needs a few frames after interaction ends.
    const tick = setInterval(() => controls.update() && render(), 50);
    return () => {
      clearInterval(tick);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      state.current = null;
    };
  }, [background]);

  useEffect(() => {
    const s = state.current;
    if (s) {
      s.grid.visible = showGrid;
      s.render();
    }
  }, [showGrid]);

  // Rebuild content when the instance tree or GLB changes.
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    for (const c of [...s.content.children]) {
      s.content.remove(c);
      c.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
    }
    let parts = 0;
    let triangles = 0;
    const finish = () => {
      const box = new THREE.Box3().setFromObject(s.content);
      if (!box.isEmpty()) {
        const size = box.getSize(new THREE.Vector3());
        onStats?.({ parts, triangles, size: [size.x, size.y, size.z].map((x) => Math.round(x * 100) / 100) as [number, number, number] });
        if (!s.framed) {
          const center = box.getCenter(new THREE.Vector3());
          const radius = Math.max(size.length() / 2, 2);
          s.camera.position.copy(center.clone().add(new THREE.Vector3(1, 0.75, 1).normalize().multiplyScalar(radius * 2.4)));
          s.camera.near = Math.max(0.05, radius / 200);
          s.camera.far = radius * 60 + 1000;
          s.camera.updateProjectionMatrix();
          s.controls.target.copy(center);
          s.framed = true;
        }
      } else onStats?.({ parts: 0, triangles: 0, size: [0, 0, 0] });
      s.render();
    };

    if (root) {
      walk(root, (n) => {
        if (!isA(n.className, "BasePart") || n.className === "Terrain") return;
        const size = n.properties.Size?.t === "Vector3" ? n.properties.Size.v : [4, 1, 2];
        const mesh = primitiveMesh({ shape: partShape(n), size: size as [number, number, number] });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(mesh.positions, 3));
        geo.setAttribute("normal", new THREE.Float32BufferAttribute(mesh.normals, 3));
        geo.setIndex(mesh.indices);
        const material = n.properties.Material?.t === "Enum" ? n.properties.Material.v : "Plastic";
        const pbr = pbrFor(material);
        const transparency = num(n.properties.Transparency, 0);
        const color = colorOf(n.properties.Color);
        const mat = new THREE.MeshStandardMaterial({
          color,
          roughness: pbr.roughness,
          metalness: pbr.metallic,
          transparent: transparency > 0 || material === "Glass",
          opacity: material === "Glass" ? Math.min(1 - transparency, 0.55) : 1 - transparency,
          emissive: pbr.emissive ? color : new THREE.Color(0),
          emissiveIntensity: pbr.emissive ? 1.2 : 0,
          wireframe: n.className === "MeshPart",
        });
        const m = new THREE.Mesh(geo, mat);
        m.matrixAutoUpdate = false;
        m.matrix.copy(matrixOf(n));
        m.castShadow = transparency < 0.9;
        m.receiveShadow = true;
        m.userData.id = n.id;
        s.content.add(m);
        parts++;
        triangles += mesh.indices.length / 3;
        for (const c of n.children) {
          if (c.className === "PointLight" || c.className === "SpotLight") {
            const light = new THREE.PointLight(colorOf(c.properties.Color), num(c.properties.Brightness, 1) * 8, num(c.properties.Range, 12), 1.5);
            light.position.setFromMatrixPosition(m.matrix);
            s.content.add(light);
          }
        }
      });
      finish();
    } else if (glb) {
      new GLTFLoader().parse(
        glb.slice().buffer,
        "",
        (gltf) => {
          gltf.scene.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              o.castShadow = true;
              o.receiveShadow = true;
              parts++;
              triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
            }
          });
          s.content.add(gltf.scene);
          finish();
        },
        () => finish(),
      );
    } else finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, glb]);

  // Selection highlight.
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    if (s.helper) {
      s.scene.remove(s.helper);
      s.helper.dispose();
      s.helper = undefined;
    }
    const target = selectedId ? s.content.children.find((c) => c.userData.id === selectedId) : undefined;
    if (target) {
      s.helper = new THREE.BoxHelper(target, 0x8b7bff);
      s.scene.add(s.helper);
    }
    s.render();
  }, [selectedId, root]);

  const onClick = (e: React.MouseEvent) => {
    const s = state.current;
    if (!s || !onSelect) return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const pointer = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(pointer, s.camera);
    const hit = ray.intersectObjects(s.content.children, false)[0];
    onSelect(hit?.object.userData.id);
  };

  return <div ref={host} className="absolute inset-0" onDoubleClick={onClick} />;
}
