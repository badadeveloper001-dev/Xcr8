import { apiClient } from "@/lib/api";

export type AccountDeletionResult = {
  deleted: boolean;
  message: string;
  external_platform_revocation: Array<{ platform: string; status: string }>;
  platforms_needing_manual_review: string[];
};

export async function requestAccountDeletionCode(): Promise<{ message: string; expires_in_minutes: number }> {
  const { data } = await apiClient.post<{ message: string; expires_in_minutes: number }>(
    "/api/v1/account/deletion/request",
  );
  return data;
}

export async function deleteOwnAccount(payload: {
  code: string;
  confirmation: "DELETE";
}): Promise<AccountDeletionResult> {
  const { data } = await apiClient.post<AccountDeletionResult>("/api/v1/account/deletion", payload, { timeout: 90_000 });
  return data;
}
