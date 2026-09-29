import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../context/ToastContext';

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return { ...actual, api: { createProject: vi.fn(), createEditorLaunch: vi.fn() } };
});
vi.mock('../../api/studio', () => ({
  studioApi: { createAssetUploadUrl: vi.fn(), putAssetFile: vi.fn(), confirmAssetUpload: vi.fn() },
}));

import { api, type PortalProject } from '../../api/client';
import { studioApi } from '../../api/studio';
import { Projects } from './Projects';

const m = <T extends (...args: never[]) => unknown>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const created = {
  id: 'p1',
  name: 'My shoe',
  baseModel: 'Custom GLB Mesh',
  status: 'Designing',
  rawStatus: 'draft',
  isLocked: false,
  updatedAt: '2026-09-01T00:00:00Z',
  createdAt: '2026-09-01T00:00:00Z',
  imageUrl: '',
  editorUrl: null,
  device: 'KusStudio',
  fileSize: '0 MB',
  photosCount: 0,
  verticesCount: '—',
  colorCode: '#FF5A36',
  accentColor: null,
  description: '',
  canonicalModelAssetId: null,
} as unknown as PortalProject;

const assign = vi.fn();
const realLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  // The wizard opens itself when the page is loaded with ?new=true.
  window.history.replaceState({}, '', '/projects?new=true');
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...realLocation, search: '?new=true', pathname: '/projects', assign },
  });
  m(studioApi.createAssetUploadUrl).mockResolvedValue({
    upload_url: 'https://storage.example/put',
    asset_id: 'a1',
    file_path: 'source_models/p1/a1.glb',
    expires_in: 900,
  });
  m(studioApi.putAssetFile).mockResolvedValue(undefined);
  m(studioApi.confirmAssetUpload).mockResolvedValue({ id: 'a1' });
  m(api.createProject).mockResolvedValue(created);
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

const renderWizard = () => {
  const setProjects = vi.fn();
  render(
    <ToastProvider>
      <Projects projects={[]} setProjects={setProjects} onViewDetails={vi.fn()} />
    </ToastProvider>,
  );
  return { setProjects };
};

const walkToLaunchStep = async (file: File) => {
  fireEvent.click(await screen.findByText(/upload a model/i));
  fireEvent.change(screen.getByLabelText('Upload 3D model file'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: /next step/i }));
  fireEvent.click(screen.getByRole('button', { name: /next step/i }));
  fireEvent.click(screen.getByRole('button', { name: /create & launch kusstudio/i }));
};

describe('Create-project wizard (upload source)', () => {
  it('creates the project, uploads the model, then opens KusStudio with a launch ticket', async () => {
    m(api.createEditorLaunch).mockResolvedValue({ desktopUrl: 'kusstudio://launch?t=abc', expiresIn: 60 });
    const { setProjects } = renderWizard();
    const file = new File(['glb-bytes'], 'my_shoe.glb', { type: 'model/gltf-binary' });

    await walkToLaunchStep(file);

    await waitFor(() => expect(assign).toHaveBeenCalledWith('kusstudio://launch?t=abc'));
    expect(api.createProject).toHaveBeenCalledWith(expect.objectContaining({ name: 'My shoe' }));
    expect(studioApi.putAssetFile).toHaveBeenCalledWith('https://storage.example/put', file, 'model/gltf-binary');
    expect(studioApi.confirmAssetUpload).toHaveBeenCalledWith('p1', { asset_id: 'a1', file_size_bytes: file.size });
    expect(api.createEditorLaunch).toHaveBeenCalledWith('p1');
    // Order: project exists before the upload, the model is confirmed before KusStudio opens.
    expect(m(api.createProject).mock.invocationCallOrder[0]).toBeLessThan(
      m(studioApi.createAssetUploadUrl).mock.invocationCallOrder[0],
    );
    expect(m(studioApi.confirmAssetUpload).mock.invocationCallOrder[0]).toBeLessThan(
      m(api.createEditorLaunch).mock.invocationCallOrder[0],
    );
    expect(setProjects).toHaveBeenCalledTimes(1);
  });

  it('keeps the created project when the launch fails, and a retry does not create a second one', async () => {
    m(api.createEditorLaunch)
      .mockRejectedValueOnce(new Error('Launch ticket refused'))
      .mockResolvedValueOnce({ desktopUrl: 'kusstudio://launch?t=retry', expiresIn: 60 });
    const { setProjects } = renderWizard();

    await walkToLaunchStep(new File(['glb-bytes'], 'my_shoe.glb', { type: 'model/gltf-binary' }));

    expect((await screen.findAllByText('Launch ticket refused')).length).toBeGreaterThan(0);
    expect(assign).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('kusstudio://launch?t=retry'));
    expect(api.createProject).toHaveBeenCalledTimes(1);
    expect(studioApi.confirmAssetUpload).toHaveBeenCalledTimes(1);
    expect(setProjects).toHaveBeenCalledTimes(1);
  });

  it('refuses a non-model file before leaving the first step', async () => {
    renderWizard();
    fireEvent.click(await screen.findByText(/upload a model/i));
    fireEvent.change(screen.getByLabelText('Upload 3D model file'), {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));

    expect(await screen.findByText(/only \.glb and \.gltf files/i)).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 3/i)).toBeInTheDocument();
    expect(api.createProject).not.toHaveBeenCalled();
  });
});

describe('Create-project wizard (start empty)', () => {
  it('creates an empty project and opens KusStudio without any upload', async () => {
    m(api.createEditorLaunch).mockResolvedValue({ desktopUrl: 'kusstudio://launch?t=blank', expiresIn: 60 });
    renderWizard();

    // "Start empty" is the default source; step 1 has nothing to pick.
    fireEvent.click(await screen.findByRole('button', { name: /next step/i }));
    fireEvent.change(screen.getByPlaceholderText('Air Force 1 Custom Classic'), { target: { value: 'Blank shoe' } });
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    fireEvent.click(screen.getByRole('button', { name: /create & launch kusstudio/i }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('kusstudio://launch?t=blank'));
    expect(api.createProject).toHaveBeenCalledWith(expect.objectContaining({ name: 'Blank shoe' }));
    expect(studioApi.createAssetUploadUrl).not.toHaveBeenCalled();
  });
});
