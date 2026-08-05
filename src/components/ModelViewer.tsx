"use client";

import { useEffect, useRef, useState } from "react";
import { IconCube, IconDownload } from "./Icons";

interface Props {
  fileId: number;
  ext: string;
  name: string;
}

interface Dims {
  x: number;
  y: number;
  z: number;
  triangles: number;
}

/**
 * Перегляд STL/OBJ/3MF/GLB/PLY просто в браузері: обертання пальцем,
 * пінч-зум, габарити моделі в мм. three.js підтягується динамічно,
 * щоб не важчати сторінку списку задач.
 */
export default function ModelViewer({ fileId, ext, name }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState("");
  const [dims, setDims] = useState<Dims | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    const boot = async () => {
      setStatus("loading");
      try {
        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");

        const host = hostRef.current;
        if (!host || disposed) return;

        const width = host.clientWidth || 600;
        const height = host.clientHeight || 360;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, height);
        host.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = null;

        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100000);

        scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x0b1a2b, 1.1));
        const key = new THREE.DirectionalLight(0xffffff, 1.5);
        key.position.set(1, 1.4, 1);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xf2a825, 0.5);
        fill.position.set(-1.2, -0.4, -0.8);
        scene.add(fill);

        const object = await loadModel(THREE, ext, `/api/files/${fileId}`);
        if (disposed) {
          renderer.dispose();
          return;
        }

        // Габарити рахуємо у системі координат файлу (як у CAD), до повороту
        const fileSize = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());

        // STL/OBJ/PLY/3MF — Z вгору, three.js — Y вгору. Кладемо модель «як на столі»
        const wrapper = new THREE.Group();
        if (!["glb", "gltf"].includes(ext.toLowerCase())) {
          object.rotation.x = -Math.PI / 2;
        }
        wrapper.add(object);
        wrapper.updateMatrixWorld(true);

        // Центруємо і виставляємо камеру по видимих габаритах
        const box = new THREE.Box3().setFromObject(wrapper);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        wrapper.position.sub(center);

        let triangles = 0;
        object.traverse((child) => {
          const mesh = child as import("three").Mesh;
          if (!mesh.isMesh) return;
          const geom = mesh.geometry;
          if (geom) {
            geom.computeVertexNormals();
            const pos = geom.getAttribute("position");
            triangles += geom.index ? geom.index.count / 3 : pos ? pos.count / 3 : 0;
          }
          if (!Array.isArray(mesh.material) && mesh.material) {
            const mat = mesh.material as import("three").MeshStandardMaterial;
            // Формати без матеріалів (STL/PLY) фарбуємо у фірмовий золотий
            if (!("map" in mat) || !mat.map) {
              mesh.material = new THREE.MeshStandardMaterial({
                color: 0xf2b552,
                metalness: 0.25,
                roughness: 0.55,
                flatShading: ext.toLowerCase() === "stl",
              });
            }
          }
        });

        scene.add(wrapper);

        const radius = Math.max(size.x, size.y, size.z) || 1;
        camera.position.set(radius * 1.1, radius * 0.9, radius * 1.5);
        camera.lookAt(0, 0, 0);

        const grid = new THREE.GridHelper(radius * 3, 12, 0x2a5480, 0x1d4066);
        grid.position.y = -size.y / 2;
        scene.add(grid);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.9;
        controls.target.set(0, 0, 0);
        // Обертання одним пальцем, зум/панорама двома — не конфліктує зі скролом сторінки
        controls.touches = { ONE: 0, TWO: 2 } as never;

        // Автообертання зупиняємо, щойно користувач взявся сам
        const stopAuto = () => {
          controls.autoRotate = false;
        };
        renderer.domElement.addEventListener("pointerdown", stopAuto);

        let raf = 0;
        const tick = () => {
          controls.update();
          renderer.render(scene, camera);
          raf = requestAnimationFrame(tick);
        };
        tick();

        const onResize = () => {
          const w = host.clientWidth;
          const h = host.clientHeight;
          if (!w || !h) return;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        };
        const ro = new ResizeObserver(onResize);
        ro.observe(host);

        setDims({
          x: fileSize.x,
          y: fileSize.y,
          z: fileSize.z,
          triangles: Math.round(triangles),
        });
        setStatus("ready");

        cleanup = () => {
          cancelAnimationFrame(raf);
          ro.disconnect();
          renderer.domElement.removeEventListener("pointerdown", stopAuto);
          controls.dispose();
          scene.traverse((child) => {
            const mesh = child as import("three").Mesh;
            mesh.geometry?.dispose?.();
            const mat = mesh.material;
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
            else mat?.dispose?.();
          });
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch (e) {
        if (disposed) return;
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Не вдалося відкрити модель");
      }
    };

    void boot();
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [started, fileId, ext]);

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-navy-950/60">
      <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2">
        <IconCube className="h-4 w-4 shrink-0 text-gold-400" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
        <a
          href={`/api/files/${fileId}?download`}
          className="btn btn-ghost btn-sm !min-h-8 shrink-0 !px-2"
          aria-label="Завантажити модель"
        >
          <IconDownload className="h-4 w-4" />
        </a>
      </div>

      <div className="relative">
        <div ref={hostRef} className="h-[300px] w-full touch-none sm:h-[420px]" />

        {!started && (
          <button
            type="button"
            onClick={() => setStarted(true)}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-navy-950/40 text-sm font-semibold transition hover:bg-navy-950/20"
          >
            <IconCube className="h-9 w-9 text-gold-400" />
            Показати 3D-модель
            <span className="text-xs font-normal text-ink-dim">
              завантажиться {ext.toUpperCase()} і відкриється перегляд
            </span>
          </button>
        )}

        {started && status === "loading" && (
          <div className="absolute inset-0 grid place-items-center text-sm text-ink-muted">
            Завантаження моделі…
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 grid place-items-center px-4 text-center text-sm text-danger">
            {message || "Модель не відкрилась"}
          </div>
        )}
      </div>

      {dims && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/8 px-3 py-2 text-xs text-ink-muted">
          <span>
            Габарити:{" "}
            <span className="font-semibold text-ink">
              {dims.x.toFixed(1)} × {dims.y.toFixed(1)} × {dims.z.toFixed(1)}
            </span>{" "}
            мм
          </span>
          <span>
            Трикутників: <span className="font-semibold text-ink">{dims.triangles.toLocaleString("uk-UA")}</span>
          </span>
          <span className="text-ink-dim">обертання — палець, зум — два пальці</span>
        </div>
      )}
    </div>
  );
}

/** Динамічно підбираємо лоадер під формат файлу. */
async function loadModel(
  THREE: typeof import("three"),
  ext: string,
  url: string
): Promise<import("three").Object3D> {
  const format = ext.toLowerCase();

  if (format === "stl") {
    const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
    const geometry = await new STLLoader().loadAsync(url);
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  }

  if (format === "ply") {
    const { PLYLoader } = await import("three/examples/jsm/loaders/PLYLoader.js");
    const geometry = await new PLYLoader().loadAsync(url);
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  }

  if (format === "obj") {
    const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
    return await new OBJLoader().loadAsync(url);
  }

  if (format === "3mf") {
    const { ThreeMFLoader } = await import("three/examples/jsm/loaders/3MFLoader.js");
    return await new ThreeMFLoader().loadAsync(url);
  }

  if (format === "glb" || format === "gltf") {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const gltf = await new GLTFLoader().loadAsync(url);
    return gltf.scene;
  }

  throw new Error(`Формат .${format} не має вбудованого перегляду — завантажте файл`);
}
