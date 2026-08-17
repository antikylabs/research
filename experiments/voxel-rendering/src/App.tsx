import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent } from 'react';

import { createInstancesApproach } from './approaches/instances/index.ts';
import { createMeshApproach } from './approaches/mesh/index.ts';
import { createRaytraceApproach } from './approaches/raytrace/index.ts';
import { GenerationFence } from './app/generation.ts';
import { attachCanvasWheelZoom } from './app/canvas-wheel.ts';
import { OrbitCamera } from './camera/orbit-camera.ts';
import type {
  ApproachFactory,
  ApproachId,
  PresentationStyle,
  RenderStats,
  VoxelApproach,
} from './render/types.ts';
import { createBuiltInScene } from './scene/built-in.ts';
import type { VoxelScene } from './scene/types.ts';
import { normalizeVoxModel } from './vox/normalize.ts';
import { parseVox } from './vox/parse.ts';
import type { VoxDocument } from './vox/parse.ts';

const APPROACHES: Readonly<Record<ApproachId, Readonly<{
  eyebrow: string;
  label: string;
  note: string;
  factory: ApproachFactory;
}>>> = Object.freeze({
  mesh: {
    eyebrow: '01 · surface',
    label: 'Greedy mesh',
    note: 'AO-aware merged geometry · physical raster',
    factory: createMeshApproach,
  },
  instances: {
    eyebrow: '02 · faces',
    label: 'Face instances',
    note: 'One quad per exposed face · graphic raster',
    factory: createInstancesApproach,
  },
  raytrace: {
    eyebrow: '03 · volume',
    label: 'Path trace',
    note: 'Dense DDA · progressive indirect light',
    factory: createRaytraceApproach,
  },
});

type StageStatus = 'loading' | 'running' | 'failed';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function diagnostic(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultStats(approach: ApproachId, scene: VoxelScene): RenderStats {
  return {
    approach,
    implementation: 'Constructing pipeline',
    voxels: scene.cells.length,
    primitives: 0,
    drawCalls: 0,
    oneTimeBytes: 0,
    uploadBytesPerFrame: 0,
    detail: 'Waiting for WebGPU resources.',
  };
}

export default function App() {
  const builtInScene = useMemo(createBuiltInScene, []);
  const [scene, setScene] = useState<VoxelScene>(builtInScene);
  const [voxDocument, setVoxDocument] = useState<VoxDocument | null>(null);
  const [sourceName, setSourceName] = useState('Built-in evidence scene');
  const [approachId, setApproachId] = useState<ApproachId>('mesh');
  const [style, setStyle] = useState<PresentationStyle>('physical');
  const [status, setStatus] = useState<StageStatus>('loading');
  const [issue, setIssue] = useState<string | null>(null);
  const [stats, setStats] = useState<RenderStats>(() => defaultStats('mesh', builtInScene));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef(new OrbitCamera());
  const styleRef = useRef(style);
  const approachRef = useRef<VoxelApproach | null>(null);
  const generationRef = useRef(new GenerationFence());
  const pointerRef = useRef<Readonly<{ id: number; x: number; y: number }> | null>(null);

  useEffect(() => {
    styleRef.current = style;
  }, [style]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return undefined;
    return attachCanvasWheelZoom(canvas, (deltaY) => cameraRef.current.zoom(deltaY * 0.018));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return undefined;
    const generation = generationRef.current.begin();
    let stateTimer = 0;
    let lastStatsUpdate = 0;
    let localApproach: VoxelApproach | null = null;
    setIssue(null);
    setStatus('loading');
    setStats(defaultStats(approachId, scene));
    approachRef.current?.dispose();
    approachRef.current = null;

    void APPROACHES[approachId].factory({
      canvas,
      scene,
      initialStyle: styleRef.current,
      onError(error) {
        if (!generationRef.current.isCurrent(generation)) return;
        setIssue(error.message);
        setStatus('failed');
      },
    }).then((created) => {
      if (!generationRef.current.isCurrent(generation)) {
        created.dispose();
        return;
      }
      localApproach = created;
      approachRef.current = created;
      setStats(created.stats());
      setStatus('running');
      const start = performance.now();
      const publishState = (): void => {
        if (!generationRef.current.isCurrent(generation)) return;
        const width = Math.max(1, canvas.clientWidth);
        const height = Math.max(1, canvas.clientHeight);
        const time = performance.now();
        created.frame((time - start) / 1000, cameraRef.current.snapshot(width / height), styleRef.current);
        if (time - lastStatsUpdate > 180) {
          setStats(created.stats());
          lastStatsUpdate = time;
        }
      };
      publishState();
      stateTimer = window.setInterval(publishState, 32);
    }).catch((error: unknown) => {
      if (!generationRef.current.isCurrent(generation)) return;
      setIssue(diagnostic(error));
      setStatus('failed');
    });

    return () => {
      generationRef.current.cancel();
      window.clearInterval(stateTimer);
      if (approachRef.current === localApproach) approachRef.current = null;
      localApproach?.dispose();
    };
  }, [approachId, scene]);

  const loadFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    setIssue(null);
    try {
      const started = performance.now();
      const document = parseVox(await file.arrayBuffer());
      const parseMilliseconds = performance.now() - started;
      setVoxDocument(document);
      setSourceName(file.name);
      setScene(normalizeVoxModel(document, 0, file.name, parseMilliseconds));
      cameraRef.current = new OrbitCamera();
    } catch (error) {
      setIssue(diagnostic(error));
      setStatus('failed');
    }
  };

  const loadFixture = async (): Promise<void> => {
    setIssue(null);
    try {
      const started = performance.now();
      const response = await fetch('./models/lumen-observatory.vox');
      if (!response.ok) throw new Error(`Fixture request failed with HTTP ${response.status}.`);
      const document = parseVox(await response.arrayBuffer());
      const parseMilliseconds = performance.now() - started;
      setVoxDocument(document);
      setSourceName('lumen-observatory.vox');
      setScene(normalizeVoxModel(document, 0, 'Lumen Observatory · .vox', parseMilliseconds));
      cameraRef.current = new OrbitCamera();
    } catch (error) {
      setIssue(diagnostic(error));
      setStatus('failed');
    }
  };

  const chooseModel = (event: ChangeEvent<HTMLSelectElement>): void => {
    if (voxDocument === null) return;
    const modelIndex = Number(event.target.value);
    setScene(normalizeVoxModel(voxDocument, modelIndex, sourceName, scene.receipt.parseMilliseconds));
    cameraRef.current = new OrbitCamera();
  };

  const useBuiltIn = (): void => {
    setVoxDocument(null);
    setSourceName('Built-in evidence scene');
    setScene(builtInScene);
    setIssue(null);
    cameraRef.current = new OrbitCamera();
  };

  const beginOrbit = (event: PointerEvent<HTMLCanvasElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const continueOrbit = (event: PointerEvent<HTMLCanvasElement>): void => {
    const previous = pointerRef.current;
    if (previous?.id !== event.pointerId) return;
    const deltaX = event.clientX - previous.x;
    const deltaY = event.clientY - previous.y;
    cameraRef.current.orbit(-deltaX * 0.008, -deltaY * 0.008);
    pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const finishOrbit = (event: PointerEvent<HTMLCanvasElement>): void => {
    if (pointerRef.current?.id !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerRef.current = null;
  };

  const approach = APPROACHES[approachId];
  const warning = scene.receipt.warnings[0];
  return (
    <main className="lab-shell">
      <header className="titlebar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">A</span>
          <strong>Antiky Labs</strong>
          <span>Voxel rendering field lab</span>
        </div>
        <div className="titlebar-state">
          <span className={`status-dot status-${status}`} aria-hidden="true" />
          <span>{status === 'running' ? 'WebGPU running' : status === 'failed' ? 'Needs attention' : 'Building pipeline'}</span>
        </div>
      </header>

      <section className="workspace">
        <section className="stage" aria-label={`${approach.label} render stage`}>
          <canvas
            ref={canvasRef}
            aria-label="Interactive voxel rendering"
            onPointerDown={beginOrbit}
            onPointerMove={continueOrbit}
            onPointerUp={finishOrbit}
            onPointerCancel={finishOrbit}
          />
          <div className="stage-heading">
            <span>{approach.eyebrow}</span>
            <h1>{approach.label}</h1>
            <p>{approach.note}</p>
          </div>
          {status !== 'running' && (
            <div className={`stage-message ${status === 'failed' ? 'stage-error' : ''}`} role="status">
              <span>{status === 'failed' ? 'Renderer stopped' : 'Compiling evidence'}</span>
              <strong>{issue ?? 'Acquiring a WebGPU adapter and uploading immutable scene data.'}</strong>
            </div>
          )}
          <nav className="approach-tabs" aria-label="Rendering implementation">
            {(Object.entries(APPROACHES) as [ApproachId, typeof approach][]).map(([id, item]) => (
              <button
                aria-pressed={approachId === id}
                className={approachId === id ? 'selected' : ''}
                key={id}
                onClick={() => setApproachId(id)}
                type="button"
              >
                <span>{item.eyebrow}</span>
                <strong>{item.label}</strong>
              </button>
            ))}
          </nav>
          <div className="stage-hint">Drag to orbit · wheel to move</div>
        </section>

        <aside className="inspector" aria-label="Renderer inspector">
          <section className="inspector-section inspector-intro">
            <span className="section-label">Live comparison</span>
            <h2>One scene.<br />Three pipelines.</h2>
            <p>The geometry and light transport change. The source scene and camera do not.</p>
          </section>

          <section className="inspector-section">
            <div className="section-row">
              <span className="section-label">Presentation</span>
              <button className="quiet-button" onClick={() => cameraRef.current.reset()} type="button">Reset view</button>
            </div>
            <div className="segmented">
              {(['physical', 'graphic'] as const).map((option) => (
                <button
                  aria-pressed={style === option}
                  className={style === option ? 'selected' : ''}
                  key={option}
                  onClick={() => setStyle(option)}
                  type="button"
                >{option === 'physical' ? 'Physical' : 'Graphic'}</button>
              ))}
            </div>
          </section>

          <section className="inspector-section source-section">
            <span className="section-label">Scene source</span>
            <strong>{scene.name}</strong>
            <span className="source-meta">{scene.receipt.source === 'built-in' ? 'Original deterministic fixture' : sourceName}</span>
            <div className="source-actions">
              <label className="file-button">
                <input accept=".vox" onChange={(event) => void loadFile(event)} type="file" />
                Load .vox
              </label>
              {scene.receipt.source !== 'built-in' && (
                <button className="quiet-button" onClick={useBuiltIn} type="button">Use built-in</button>
              )}
            </div>
            {scene.receipt.source === 'built-in' && (
              <button className="fixture-button" onClick={() => void loadFixture()} type="button">
                Reopen this scene through the .vox parser
              </button>
            )}
            {voxDocument !== null && voxDocument.models.length > 1 && (
              <label className="model-select">
                Model
                <select onChange={chooseModel} value={scene.receipt.selectedModel}>
                  {voxDocument.models.map((model, index) => (
                    <option key={`${model.size.join('-')}-${index}`} value={index}>
                      {index + 1} · {model.size.join(' × ')} · {model.voxels.length} voxels
                    </option>
                  ))}
                </select>
              </label>
            )}
            {warning !== undefined && <p className="warning">{warning}</p>}
          </section>

          <section className="inspector-section measurements">
            <span className="section-label">Evidence receipt</span>
            <dl>
              <div><dt>Voxels</dt><dd>{stats.voxels.toLocaleString()}</dd></div>
              <div><dt>{approachId === 'raytrace' ? 'Samples' : 'Primitives'}</dt><dd>{(stats.sampleCount ?? stats.primitives).toLocaleString()}</dd></div>
              <div><dt>Draw calls</dt><dd>{stats.drawCalls}</dd></div>
              <div><dt>One-time GPU data</dt><dd>{formatBytes(stats.oneTimeBytes)}</dd></div>
              <div><dt>Frame upload</dt><dd>{formatBytes(stats.uploadBytesPerFrame)}</dd></div>
              <div><dt>Scene</dt><dd>{scene.dimensions.join(' × ')}</dd></div>
            </dl>
            <p>{stats.implementation}</p>
            <p className="detail">{stats.detail}</p>
            {stats.resetReason !== undefined && <p className="reset-reason">Reset: {stats.resetReason}</p>}
          </section>

          <section className="inspector-section support-note">
            <span className="section-label">Import boundary</span>
            <p>Validated MagicaVoxel v150 base models. Scene graphs and animation are diagnosed, not silently claimed. Glass is an opaque/tinted approximation.</p>
          </section>
        </aside>
      </section>

      <footer className="statusbar">
        <span><i className={`status-dot status-${status}`} /> {status}</span>
        <span>{scene.fingerprint}</span>
        <span>{stats.detail}</span>
        <span className="statusbar-right">BroMetal 0.18 · WebGPU</span>
      </footer>
    </main>
  );
}
