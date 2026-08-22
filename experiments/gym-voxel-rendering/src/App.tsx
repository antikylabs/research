import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';

import { createInstancesApproach } from './approaches/instances/index.ts';
import { createMeshApproach } from './approaches/mesh/index.ts';
import { createRaytraceApproach } from './approaches/raytrace/index.ts';
import { GenerationFence } from './app/generation.ts';
import { FlyCamera } from './camera/fly-camera.ts';
import { FlyInput } from './camera/fly-input.ts';
import type {
  ApproachFactory,
  ApproachId,
  RenderStats,
  VoxelApproach,
} from './render/types.ts';
import {
  composeStudioScene,
  ENVIRONMENT_PRESETS,
  listBundledSubjects,
  type EnvironmentId,
} from './scene/studio-scenes.ts';
import type { VoxelScene } from './scene/types.ts';
import { normalizeVoxModel } from './vox/normalize.ts';
import { parseVox } from './vox/parse.ts';
import {
  DEFAULT_RENDER_SETTINGS,
  normalizeRenderSettings,
  type RenderSettings,
} from './studio/settings.ts';
import { createStudioSessionState, reduceStudioSession } from './studio/session.ts';
import { installFlyKeyboardListeners, startStudioPublisher } from './studio/runtime.ts';

const APPROACHES: Readonly<Record<ApproachId, Readonly<{
  eyebrow: string;
  label: string;
  note: string;
  factory: ApproachFactory;
}>>> = Object.freeze({
  mesh: {
    eyebrow: '01 · surface',
    label: 'Greedy mesh',
    note: 'Greedy AO surface mesh · shadowed cinematic HDR',
    factory: createMeshApproach,
  },
  instances: {
    eyebrow: '02 · faces',
    label: 'Face instances',
    note: 'Exposed-face instancing · shadowed cinematic HDR',
    factory: createInstancesApproach,
  },
  raytrace: {
    eyebrow: '03 · volume',
    label: 'Path trace',
    note: 'Dense DDA path tracing · thin-lens accumulation',
    factory: createRaytraceApproach,
  },
});

type StageStatus = 'loading' | 'running' | 'failed';

type CatalogEntry = Readonly<{
  id: string;
  label: string;
  source: string;
  subject: VoxelScene;
}>;

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
  const bundledCatalog = useMemo<readonly CatalogEntry[]>(() => listBundledSubjects().map(
    (subject, index) => Object.freeze({
      id: `bundled:${index}:${subject.fingerprint}`,
      label: subject.name,
      source: 'Original bundled subject',
      subject,
    }),
  ), []);
  const [catalog, setCatalog] = useState<readonly CatalogEntry[]>(bundledCatalog);
  const [studio, dispatchStudio] = useReducer(
    reduceStudioSession,
    bundledCatalog[0]!.id,
    createStudioSessionState,
  );
  const { approachId, environmentId, rendererGeneration, selectedModelId, settings } = studio;
  const selectedEntry = catalog.find((entry) => entry.id === selectedModelId) ?? catalog[0]!;
  const scene = useMemo(
    () => composeStudioScene(selectedEntry.subject, environmentId),
    [environmentId, selectedEntry],
  );
  const [mouseLook, setMouseLook] = useState(false);
  const [status, setStatus] = useState<StageStatus>('loading');
  const [rendererIssue, setRendererIssue] = useState<string | null>(null);
  const [importIssue, setImportIssue] = useState<string | null>(null);
  const [interactionIssue, setInteractionIssue] = useState<string | null>(null);
  const [stats, setStats] = useState<RenderStats>(() => defaultStats('mesh', scene));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef(new FlyCamera());
  const inputRef = useRef(new FlyInput());
  const settingsRef = useRef(settings);
  const approachRef = useRef<VoxelApproach | null>(null);
  const generationRef = useRef(new GenerationFence());

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    return installFlyKeyboardListeners(
      window,
      inputRef.current,
      () => document.pointerLockElement === canvasRef.current,
    );
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return undefined;
    const onPointerLockChange = (): void => {
      const active = document.pointerLockElement === canvas;
      setMouseLook(active);
      if (active) setInteractionIssue(null);
      if (!active) inputRef.current.clear();
    };
    const onMouseMove = (event: MouseEvent): void => {
      if (document.pointerLockElement !== canvas) return;
      cameraRef.current.look(event.movementX * 0.0024, -event.movementY * 0.0024);
    };
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mousemove', onMouseMove);
    return () => {
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('mousemove', onMouseMove);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return undefined;
    const generation = generationRef.current.begin();
    let stopPublisher: (() => void) | null = null;
    let lastStatsUpdate = 0;
    let localApproach: VoxelApproach | null = null;
    setRendererIssue(null);
    setStatus('loading');
    setStats(defaultStats(approachId, scene));
    approachRef.current?.dispose();
    approachRef.current = null;

    void APPROACHES[approachId].factory({
      canvas,
      scene,
      initialSettings: settingsRef.current,
      onError(error) {
        if (!generationRef.current.isCurrent(generation)) return;
        setRendererIssue(error.message);
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
      let previousFrameTime = start;
      const publishState = (): void => {
        if (!generationRef.current.isCurrent(generation)) return;
        const width = Math.max(1, canvas.clientWidth);
        const height = Math.max(1, canvas.clientHeight);
        const time = performance.now();
        const deltaSeconds = Math.min(0.1, Math.max(0, (time - previousFrameTime) / 1000));
        previousFrameTime = time;
        cameraRef.current.move(inputRef.current.movement(), deltaSeconds);
        created.frame(
          (time - start) / 1000,
          cameraRef.current.snapshot(width / height),
          settingsRef.current,
        );
        if (time - lastStatsUpdate > 180) {
          setStats(created.stats());
          lastStatsUpdate = time;
        }
      };
      stopPublisher = startStudioPublisher(window, publishState);
    }).catch((error: unknown) => {
      if (!generationRef.current.isCurrent(generation)) return;
      setRendererIssue(diagnostic(error));
      setStatus('failed');
    });

    return () => {
      generationRef.current.cancel();
      stopPublisher?.();
      if (approachRef.current === localApproach) approachRef.current = null;
      localApproach?.dispose();
    };
  }, [approachId, rendererGeneration, scene]);

  const addFiles = async (files: readonly File[]): Promise<void> => {
    if (files.length === 0) return;
    setImportIssue(null);
    const additions: CatalogEntry[] = [];
    const failures: string[] = [];
    for (const file of files) {
      try {
        const started = performance.now();
        const document = parseVox(await file.arrayBuffer());
        const parseMilliseconds = performance.now() - started;
        for (let modelIndex = 0; modelIndex < document.models.length; modelIndex += 1) {
          const subject = normalizeVoxModel(
            document,
            modelIndex,
            `${file.name} · model ${modelIndex + 1}`,
            parseMilliseconds,
          );
          additions.push(Object.freeze({
            id: `file:${file.name}:${file.lastModified}:${modelIndex}:${subject.fingerprint}`,
            label: subject.name,
            source: `${file.name} · local browser session`,
            subject,
          }));
        }
      } catch (error) {
        failures.push(`${file.name}: ${diagnostic(error)}`);
      }
    }
    if (additions.length > 0) {
      setCatalog((current) => Object.freeze([...current, ...additions]));
      dispatchStudio({ type: 'select-model', modelId: additions[0]!.id });
      cameraRef.current = new FlyCamera();
    }
    if (failures.length > 0) {
      setImportIssue(`Rejected model data — ${failures.join(' · ')}`);
    }
  };

  const loadFiles = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    await addFiles(files);
  };

  const chooseModel = (event: ChangeEvent<HTMLSelectElement>): void => {
    dispatchStudio({ type: 'select-model', modelId: event.target.value });
    cameraRef.current = new FlyCamera();
  };

  const chooseEnvironment = (event: ChangeEvent<HTMLSelectElement>): void => {
    dispatchStudio({
      type: 'select-environment',
      environmentId: event.target.value as EnvironmentId,
    });
    cameraRef.current = new FlyCamera();
  };

  const dropFiles = (event: DragEvent<HTMLElement>): void => {
    event.preventDefault();
    void addFiles([...event.dataTransfer.files]);
  };

  const updateSettings = (next: RenderSettings): void => {
    dispatchStudio({ type: 'update-settings', settings: normalizeRenderSettings(next) });
  };

  const beginMouseLook = (): void => {
    const canvas = canvasRef.current;
    if (canvas === null || document.pointerLockElement === canvas) return;
    void canvas.requestPointerLock().catch((error: unknown) => {
      setInteractionIssue(`Mouse-look unavailable — ${diagnostic(error)}`);
    });
  };

  const approach = APPROACHES[approachId];
  const warning = scene.receipt.warnings.find((message) => !message.startsWith('Studio composition'));
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
        <section
          className="stage"
          aria-label={`${approach.label} render stage`}
          onDragOver={(event) => event.preventDefault()}
          onDrop={dropFiles}
        >
          <canvas
            ref={canvasRef}
            aria-label="Interactive voxel rendering"
            onClick={beginMouseLook}
          />
          <div className="stage-heading">
            <span>{approach.eyebrow}</span>
            <h1>{approach.label}</h1>
            <p>{approach.note}</p>
          </div>
          {status !== 'running' && (
            <div className={`stage-message ${status === 'failed' ? 'stage-error' : ''}`} role="status">
              <span>{status === 'failed' ? 'Renderer stopped' : 'Compiling evidence'}</span>
              <strong>{rendererIssue ?? 'Acquiring a WebGPU adapter and uploading immutable scene data.'}</strong>
            </div>
          )}
          <nav className="approach-tabs" aria-label="Rendering implementation">
            {(Object.entries(APPROACHES) as [ApproachId, typeof approach][]).map(([id, item]) => (
              <button
                aria-pressed={approachId === id}
                className={approachId === id ? 'selected' : ''}
                key={id}
                onClick={() => dispatchStudio({ type: 'select-approach', approachId: id })}
                type="button"
              >
                <span>{item.eyebrow}</span>
                <strong>{item.label}</strong>
              </button>
            ))}
          </nav>
          <div className={`stage-hint ${mouseLook ? 'active' : ''}`}>
            {interactionIssue ?? (mouseLook
              ? 'Mouse-look active · WASD move · Space/Shift rise/fall · Esc release'
              : 'Click stage for mouse-look · WASD move')}
          </div>
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
                  aria-pressed={settings.style === option}
                  className={settings.style === option ? 'selected' : ''}
                  key={option}
                  onClick={() => updateSettings({ ...settings, style: option })}
                  type="button"
                >{option === 'physical' ? 'Photorealistic' : 'Stylized'}</button>
              ))}
            </div>
            <label className="toggle-control">
              <span>Final color grade</span>
              <input
                checked={settings.finalColorGrade}
                onChange={(event) => updateSettings({
                  ...settings,
                  finalColorGrade: event.target.checked,
                })}
                type="checkbox"
              />
            </label>
          </section>

          <section className="inspector-section control-stack">
            <div className="section-row">
              <span className="section-label">Camera & focus</span>
              <button
                className="quiet-button"
                onClick={() => updateSettings({
                  ...settings,
                  depthOfField: DEFAULT_RENDER_SETTINGS.depthOfField,
                })}
                type="button"
              >Reset focus</button>
            </div>
            <label className="toggle-control">
              <span>Depth of field</span>
              <input
                checked={settings.depthOfField.enabled}
                onChange={(event) => updateSettings({
                  ...settings,
                  depthOfField: { ...settings.depthOfField, enabled: event.target.checked },
                })}
                type="checkbox"
              />
            </label>
            <label className="range-control">
              <span>Focus distance <output>{settings.depthOfField.focusDistance.toFixed(0)}</output></span>
              <input
                max="360"
                min="1"
                onChange={(event) => updateSettings({
                  ...settings,
                  depthOfField: {
                    ...settings.depthOfField,
                    focusDistance: Number(event.target.value),
                  },
                })}
                step="1"
                type="range"
                value={settings.depthOfField.focusDistance}
              />
            </label>
            <label className="range-control">
              <span>Aperture <output>{settings.depthOfField.aperture.toFixed(2)}</output></span>
              <input
                max="2.5"
                min="0"
                onChange={(event) => updateSettings({
                  ...settings,
                  depthOfField: {
                    ...settings.depthOfField,
                    aperture: Number(event.target.value),
                  },
                })}
                step="0.05"
                type="range"
                value={settings.depthOfField.aperture}
              />
            </label>
          </section>

          <section className="inspector-section control-stack">
            <span className="section-label">Lighting</span>
            <label className="range-control">
              <span>Time of day <output>{settings.lighting.timeOfDay.toFixed(2)}h</output></span>
              <input
                max="23.75"
                min="0"
                onChange={(event) => updateSettings({
                  ...settings,
                  lighting: { ...settings.lighting, timeOfDay: Number(event.target.value) },
                })}
                step="0.25"
                type="range"
                value={settings.lighting.timeOfDay}
              />
            </label>
            <label className="toggle-control">
              <span>Moon</span>
              <input
                checked={settings.lighting.moonEnabled}
                onChange={(event) => updateSettings({
                  ...settings,
                  lighting: { ...settings.lighting, moonEnabled: event.target.checked },
                })}
                type="checkbox"
              />
            </label>
            <label className="range-control">
              <span>Exposure <output>{settings.exposure.toFixed(2)}</output></span>
              <input
                max="3"
                min="0.25"
                onChange={(event) => updateSettings({ ...settings, exposure: Number(event.target.value) })}
                step="0.05"
                type="range"
                value={settings.exposure}
              />
            </label>
            <label className="range-control">
              <span>Surface variation <output>{settings.materialVariation.toFixed(2)}</output></span>
              <input
                max="1"
                min="0"
                onChange={(event) => updateSettings({
                  ...settings,
                  materialVariation: Number(event.target.value),
                })}
                step="0.05"
                type="range"
                value={settings.materialVariation}
              />
            </label>
            <button
              className="fixture-button"
              onClick={() => dispatchStudio({ type: 'reload-renderer' })}
              type="button"
            >Reload renderer</button>
          </section>

          <section className="inspector-section source-section">
            <span className="section-label">Model & environment</span>
            <strong>{selectedEntry.label}</strong>
            <span className="source-meta">{selectedEntry.source}</span>
            <label className="model-select">
              Model catalog
              <select onChange={chooseModel} value={selectedEntry.id}>
                {catalog.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.label}</option>
                ))}
              </select>
            </label>
            <label className="model-select">
              Environment
              <select onChange={chooseEnvironment} value={environmentId}>
                {ENVIRONMENT_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.label}</option>
                ))}
              </select>
            </label>
            <div className="source-actions">
              <label className="file-button">
                <input
                  accept=".vox"
                  multiple
                  onChange={(event) => void loadFiles(event)}
                  type="file"
                />
                Add .vox files
              </label>
            </div>
            <span className="source-meta">Drop one or more `.vox` files on the stage to keep them in this browser session.</span>
            {warning !== undefined && <p className="warning">{warning}</p>}
            {importIssue !== null && <p className="warning">{importIssue}</p>}
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
            <p>Validated MagicaVoxel v150 base models. Scene graphs and animation are diagnosed, not silently claimed. Raster water/glass use an alpha pass; dense DDA adds bounded straight-through transmission. Refractive ray bending is out of scope.</p>
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
