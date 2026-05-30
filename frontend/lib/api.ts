import axios from "axios";

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const useDirectApi = process.env.NEXT_PUBLIC_USE_DIRECT_API === "true";

// Default to same-origin proxy to avoid calling protected upstream URLs from the browser.
const apiBaseUrl = useDirectApi && configuredApiUrl ? configuredApiUrl : "/";

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  timeout: 10_000,
});

export type SessionPayload = {
  user_id: number;
  email: string;
  display_name: string;
  full_name?: string | null;
  username?: string | null;
  onboarding_complete: boolean;
  google_oauth_enabled: boolean;
};

export type SignupPayload = {
  full_name: string;
  username: string;
  email: string;
  password: string;
  confirm_password: string;
  language: string;
  timezone: string;
};

export type LoginPayload = {
  email: string;
  password: string;
  remember_me: boolean;
};

export type PasswordResetPayload = {
  email: string;
};

export type PasswordResetConfirmPayload = {
  token: string;
  new_password: string;
  confirm_password: string;
};

export type OnboardingPayload = {
  user_id: number;
  creator_type: string;
  platforms_used: string[];
  content_niche: string;
  audience_location: string;
  content_goals: string[];
  posting_frequency: string;
  tone: string;
  personality: string;
};

export type DistributionDraftPayload = {
  user_id: number;
  title: string;
  media_url: string;
  media_type: string;
  master_caption: string;
  primary_language: string;
  selected_platforms: string[];
  target_languages?: string[];
};

export type SchedulePayload = {
  user_id: number;
  post_id: number;
  platform: string;
  scheduled_for: string;
  timezone: string;
  recurring_rule?: string | null;
};

export type DashboardOverviewPayload = {
  greeting: string;
  creator_name: string;
  platforms_connected: number;
  drafts: number;
  scheduled: number;
  ai_suggestions: number;
  recent_posts: Array<{ post_id: number; title: string; status: string; media_url: string }>;
  ai_insights: Array<{ title: string; description: string }>;
  connected_platforms: Array<{ platform: string; account_handle: string; is_active: boolean }>;
  ai_ops?: {
    total_generations: number;
    total_prompt_tokens: number;
    total_completion_tokens: number;
    average_latency_ms: number;
    most_used_template: string;
  };
};

type DistributionDraftResponse = {
  post_id: number;
  status: string;
  variants: Array<{
    platform: string;
    language: string;
    adapted_caption: string;
    hashtags: string[];
    hook: string;
    approved: boolean;
  }>;
};

type ApproveDistributionResponse = {
  post_id: number;
  approved_count: number;
  status: string;
};

type QueueScheduleResponse = {
  schedule_id: number;
  post_id: number;
  queue_status: string;
  scheduled_for: string;
};

type CalendarResponse = {
  items: Array<{
    schedule_id: number;
    platform: string;
    post_id: number;
    scheduled_for: string;
    timezone: string;
    status: string;
  }>;
};

type WriteMemoryResponse = {
  memory_id: number;
};

type MemoryProfileResponse = {
  items: Array<{
    memory_type: string;
    memory_key: string;
    memory_value: string;
    confidence_score: number;
  }>;
  vector_memory: { provider: string; index_name: string; embedding_model: string };
};

export type AiUsageSummaryResponse = {
  total_generations: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  average_latency_ms: number;
  estimated_cost_usd: number;
  models: Record<string, number>;
  template_versions: Record<string, number>;
  most_used_template: string;
};

export type AiBrainstormPayload = {
  user_id: number;
  topic: string;
  platform: string;
  language: string;
  goal: string;
  tone: string;
  audience_location?: string | null;
};

export type AiBrainstormResponse = {
  topic: string;
  platform: string;
  language: string;
  goal: string;
  model: string;
  prompt_template_version: string;
  latency_ms: number;
  ideas: Array<{
    title: string;
    angle: string;
    hook: string;
    caption_seed: string;
    cta: string;
    hashtags: string[];
  }>;
  usage: Record<string, unknown>;
};

export async function signup(payload: SignupPayload): Promise<SessionPayload> {
  const { data } = await apiClient.post<SessionPayload>("/api/v1/auth/signup", payload);
  return data;
}

export async function login(payload: LoginPayload): Promise<SessionPayload> {
  const { data } = await apiClient.post<SessionPayload>("/api/v1/auth/login", payload);
  return data;
}

export async function requestPasswordReset(
  payload: PasswordResetPayload,
): Promise<{ message: string; reset_url?: string | null }> {
  const { data } = await apiClient.post<{ message: string; reset_url?: string | null }>(
    "/api/v1/auth/password-reset/request",
    payload,
  );
  return data;
}

export async function confirmPasswordReset(
  payload: PasswordResetConfirmPayload,
): Promise<{ message: string }> {
  const { data } = await apiClient.post<{ message: string }>(
    "/api/v1/auth/password-reset/confirm",
    payload,
  );
  return data;
}

export async function getSession(userId: number): Promise<SessionPayload> {
  const { data } = await apiClient.get<SessionPayload>(`/api/v1/auth/session/${userId}`);
  return data;
}

export async function completeOnboarding(payload: OnboardingPayload): Promise<SessionPayload> {
  const { data } = await apiClient.post<SessionPayload>("/api/v1/auth/onboarding", payload);
  return data;
}

export async function getDashboardOverview(userId: number): Promise<DashboardOverviewPayload> {
  const { data } = await apiClient.get<DashboardOverviewPayload>(
    `/api/v1/dashboard/overview/${userId}`,
  );
  return data;
}

export async function createDistributionDraft(
  payload: DistributionDraftPayload,
): Promise<DistributionDraftResponse> {
  const { data } = await apiClient.post<DistributionDraftResponse>(
    "/api/v1/distribution/draft",
    payload,
    {
      timeout: 60_000,
    },
  );
  return data;
}

export async function approveDistribution(payload: {
  post_id: number;
  approvals: Array<{ platform: string; language: string; approved: boolean }>;
}): Promise<ApproveDistributionResponse> {
  const { data } = await apiClient.post<ApproveDistributionResponse>(
    "/api/v1/distribution/approve",
    payload,
  );
  return data;
}

export async function queueSchedule(payload: SchedulePayload): Promise<QueueScheduleResponse> {
  const { data } = await apiClient.post<QueueScheduleResponse>("/api/v1/scheduling/queue", payload);
  return data;
}

export async function getCalendar(userId: number): Promise<CalendarResponse> {
  const { data } = await apiClient.get<CalendarResponse>(`/api/v1/scheduling/calendar/${userId}`);
  return data;
}

export async function writeMemory(payload: {
  user_id: number;
  memory_type: string;
  memory_key: string;
  memory_value: string;
  confidence_score: number;
}): Promise<WriteMemoryResponse> {
  const { data } = await apiClient.post<WriteMemoryResponse>("/api/v1/memory/write", payload);
  return data;
}

export async function getMemoryProfile(userId: number): Promise<MemoryProfileResponse> {
  const { data } = await apiClient.get<MemoryProfileResponse>(`/api/v1/memory/profile/${userId}`);
  return data;
}

export async function getAiUsageSummary(userId: number): Promise<AiUsageSummaryResponse> {
  const { data } = await apiClient.get<AiUsageSummaryResponse>(
    `/api/v1/analytics/ai-usage/${userId}`,
  );
  return data;
}

export async function generateAiBrainstorm(
  payload: AiBrainstormPayload,
): Promise<AiBrainstormResponse> {
  const { data } = await apiClient.post<AiBrainstormResponse>("/api/v1/ai/brainstorm", payload, {
    timeout: 60_000,
  });
  return data;
}

export type PlatformConnection = {
  id: number;
  platform: string;
  handle: string;
  active: boolean;
  sync_status?: "synced" | "syncing" | "disconnected";
};

type PlatformListResponse = {
  platforms: PlatformConnection[];
};

export async function getPlatformConnections(userId: number): Promise<PlatformConnection[]> {
  const { data } = await apiClient.get<PlatformListResponse>(`/api/v1/platforms/${userId}`);
  return data.platforms;
}

export async function connectPlatform(
  userId: number,
  platform: string,
  handle: string,
): Promise<PlatformConnection> {
  const { data } = await apiClient.post<PlatformConnection>(
    `/api/v1/platforms/${userId}/connect`,
    null,
    {
      params: { platform, handle },
    },
  );
  return data;
}

export async function disconnectPlatform(userId: number, platformId: number): Promise<void> {
  await apiClient.delete(`/api/v1/platforms/${userId}/${platformId}`);
}

type ApiErrorDetail =
  | string
  | Array<{ loc?: Array<string | number>; msg?: string; type?: string }>
  | { message?: string; detail?: string };

function formatApiErrorDetail(detail: ApiErrorDetail | undefined): string | null {
  if (typeof detail === "string" && detail.trim().length > 0) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (!item?.msg) return null;
        const field = item.loc?.[item.loc.length - 1];
        if (typeof field === "string" && field !== "body") {
          return `${field.replace(/_/g, " ")}: ${item.msg}`;
        }
        return item.msg;
      })
      .filter((message): message is string => Boolean(message));

    return messages.length > 0 ? messages.join(". ") : null;
  }

  if (detail && typeof detail === "object") {
    if (typeof detail.message === "string" && detail.message.trim().length > 0) {
      return detail.message;
    }
    if (typeof detail.detail === "string" && detail.detail.trim().length > 0) {
      return detail.detail;
    }
  }

  return null;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ detail?: ApiErrorDetail }>(error)) {
    if (error.response?.status === 402) {
      return "Request was rejected by an upstream gateway. Use proxy mode by setting NEXT_PUBLIC_API_URL=/ and configure BACKEND_API_URL for the frontend server.";
    }

    if (error.response?.status === 429) {
      const detailMessage = formatApiErrorDetail(error.response?.data?.detail);
      return detailMessage ?? "Too many requests right now. Please wait a minute and try again.";
    }

    const detailMessage = formatApiErrorDetail(error.response?.data?.detail);
    if (detailMessage) {
      return detailMessage;
    }
    if (typeof error.message === "string" && error.message.trim().length > 0) {
      return error.message;
    }
  }
  return fallback;
}
