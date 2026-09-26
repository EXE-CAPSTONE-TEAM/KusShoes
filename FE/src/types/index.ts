export type User = {
  id: string;
  role: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt?: string | null;
};

export type ScanStatus = {
  id: string;
  status: string;
  sourceType: "scan" | "import";
  importName: string | null;
  errorMessage: string | null;
  modelAssetId: string | null;
  updatedAt: string;
};
