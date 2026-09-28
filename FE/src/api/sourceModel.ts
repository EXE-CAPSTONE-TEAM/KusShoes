import { studioApi, type ProjectAsset } from './studio';

// Mirrors BE/app/services/asset_service.py: ALLOWED_UPLOADS["source_model"].
const SOURCE_MODEL_CONTENT_TYPES: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
};

// Mirrors BE/app/services/asset_service.py: MAX_UPLOAD_BYTES["source_model"].
export const SOURCE_MODEL_MAX_BYTES = 500 * 1024 * 1024;

export const SOURCE_MODEL_ACCEPT = '.glb,.gltf,model/gltf-binary,model/gltf+json';

export type SourceModelImportStep = 'requesting' | 'uploading' | 'confirming';

export function inferSourceModelContentType(filename: string): string | null {
  const match = /\.[^.]+$/.exec(filename.toLowerCase());
  return match ? SOURCE_MODEL_CONTENT_TYPES[match[0]] ?? null : null;
}

/**
 * Import a project's source 3D model (C3): upload-url, then PUT to storage, then confirm.
 * The confirm call is what makes BE set the project's canonical model, so it only runs once the
 * PUT succeeded.
 */
export async function importSourceModel(
  projectId: string,
  file: File,
  onStep?: (step: SourceModelImportStep) => void,
): Promise<ProjectAsset> {
  const contentType = inferSourceModelContentType(file.name);
  if (!contentType) {
    throw new Error('Only .glb and .gltf files are supported for the 3D model.');
  }

  onStep?.('requesting');
  const upload = await studioApi.createAssetUploadUrl(projectId, {
    asset_type: 'source_model',
    filename: file.name,
    content_type: contentType,
  });

  onStep?.('uploading');
  await studioApi.putAssetFile(upload.upload_url, file, contentType);

  onStep?.('confirming');
  return studioApi.confirmAssetUpload(projectId, {
    asset_id: upload.asset_id,
    file_size_bytes: file.size,
  });
}
