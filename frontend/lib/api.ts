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
  avatar_url?: string | null;
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

export type SignupVerifyCodePayload = {
  email: string;
  code: string;
};

export type SignupVerifyLinkPayload = {
  email: string;
  token_hash: string;
  type?: "email" | "signup";
};

export type SignupVerifyPasswordPayload = {
  email: string;
  password: string;
};

export type LoginPayload = {
  email: string;
  password: string;
  remember_me: boolean;
};

export type GoogleSessionPayload = {
  access_token: string;
};

export type AdminTopCreatorItem = {
  user_id: number;
  display_name: string;
  email: string;
  posts: number;
  draft_posts: number;
  scheduled: number;
  published: number;
};

export type AdminOverviewPayload = {
  generated_at: string;
  total_users: number;
  onboarded_users: number;
  active_users_7d: number;
  total_posts: number;
  draft_posts: number;
  scheduled_posts: number;
  published_posts: number;
  ai_generations: number;
  trend_signals: number;
  top_creators: AdminTopCreatorItem[];
};

export type PasswordResetPayload = {
  email: string;
};

export type AvatarUpdatePayload = {
  user_id: number;
  avatar_url: string;
};

export type ProfileUpdatePayload = {
  user_id: number;
  display_name: string;
  full_name?: string | null;
  username?: string | null;
};

export type PasswordResetConfirmPayload = {
  token: string;
  new_password: string;
  confirm_password: string;
};

export type OnboardingPayload = {
  user_id: number;
  creator_type: string[];
  platforms_used: string[];
  content_niche: string[];
  audience_location: string[];
  content_goals: string[];
  posting_frequency: string[];
  tone: string[];
  personality: string[];
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
  cr8or_ai_alert?: {
    title: string;
    message: string;
    prompt: string;
    trend_titles: string[];
    language: string;
  } | null;
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

export type AiTrendMapperPayload = {
  user_id: number;
  topic: string;
  goal: string;
  platform: string;
  window: "7d" | "30d" | "90d";
};

export type AiTrendSignal = {
  title: string;
  why_now: string;
  angle: string;
  hook: string;
  action: string;
  platform: string;
  confidence_score: number;
};

export type AiTrendMapperResponse = {
  topic: string;
  goal: string;
  platform: string;
  window: "7d" | "30d" | "90d";
  generated_at: string;
  summary: string;
  signals: AiTrendSignal[];
  source_stats: Record<string, number>;
};

export type IntelligenceRecommendation = {
  recommendation_type: string;
  content_angle: string;
  story_framework: string;
  brainstorm_seed: string;
  composer_seed: string;
  score: number;
};

export type IntelligenceSignal = {
  id: number;
  topic: string;
  platform: string;
  title: string;
  summary: string;
  source_label: string;
  confidence_score: number;
  momentum_score: number;
  relevance_score: number;
  opportunity_score: number;
  risk_score: number;
  status: string;
  created_at: string;
  brief: {
    what_is_happening: string;
    why_it_matters: string;
    who_is_using_it: string;
    why_it_performs: string;
    potential_risks: string;
    opportunities: string;
  };
  recommendations: IntelligenceRecommendation[];
};

export type IntelligenceNotification = {
  id: number;
  title: string;
  body: string;
  severity: string;
  related_topic: string;
  is_read: boolean;
  created_at: string;
};

export type IntelligenceFeedResponse = {
  user_id: number;
  generated_at: string;
  summary: string;
  interests: string[];
  signals: IntelligenceSignal[];
  notifications: IntelligenceNotification[];
  source_stats: Record<string, number>;
};

export type IntelligenceRefreshPayload = {
  user_id: number;
  interests?: string[];
  platform?: string;
};

export type IntelligenceFeedbackPayload = {
  user_id: number;
  trend_signal_id: number;
  action: "viewed" | "saved" | "dismissed" | "brainstormed" | "composed" | "published";
};

export type AiConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AiComposePayload = {
  user_id: number;
  prompt: string;
  platform: string;
  language: string;
  tone: string;
  audience_location?: string | null;
  messages?: AiConversationMessage[];
};

export type AiComposeResponse = {
  assistant_message: string;
  content_plan: {
    title: string;
    angle: string;
    hook: string;
    intro: string;
    body: string[];
    cta: string;
    hashtags: string[];
  };
  follow_up_question: string;
  model: string;
  prompt_template_version: string;
  latency_ms: number;
  usage: Record<string, unknown>;
};

export type AiVoiceoverPayload = {
  user_id: number;
  topic: string;
  platform: string;
  language: string;
  tone: string;
  audience_location?: string | null;
  goal: string;
  duration_seconds: number;
  pace: string;
  voice_style: string;
  messages?: AiConversationMessage[];
};

export type AiVoiceoverAudioPayload = {
  user_id: number;
  text: string;
  topic?: string;
  language: string;
  pace: string;
  voice_style: string;
  voice_type: string;
  platform?: string;
  tone?: string;
  goal?: string;
  duration_seconds?: number;
};

export type AiVoiceoverResponse = {
  script_title: string;
  hook: string;
  voiceover_script: string;
  beat_breakdown: string[];
  pacing_notes: string[];
  delivery_notes: string[];
  alt_openers: string[];
  cta: string;
  estimated_duration_seconds: number;
  platform: string;
  language: string;
  tone: string;
  voice_style: string;
  model: string;
  prompt_template_version: string;
  latency_ms: number;
  usage: Record<string, unknown>;
};

export type AiAssistantPayload = {
  user_id: number;
  email?: string;
  chat_id?: string;
  message: string;
  language?: string;
  tone?: string;
  vibe?: string | null;
  messages?: AiConversationMessage[];
};

export type AiAssistantResponse = {
  chat_id?: string | null;
  assistant_message: string;
  follow_up_question: string;
  suggested_actions: string[];
  language: string;
  tone: string;
  model: string;
  prompt_template_version: string;
  latency_ms: number;
  usage: Record<string, unknown>;
};

export type AiAssistantChatSummary = {
  chat_id: string;
  title: string;
  preview: string;
  updated_at: string;
};

export type AiAssistantChatHistory = {
  chat_id: string;
  title: string;
  updated_at: string;
  messages: AiConversationMessage[];
};

export type AiAssistantChatCreatePayload = {
  chat_id?: string | null;
  title?: string | null;
};

export type SignupResponse = {
  message: string;
  requires_verification?: boolean;
};

export async function signup(payload: SignupPayload): Promise<SignupResponse> {
  const { data } = await apiClient.post<SignupResponse>(
    "/api/v1/auth/signup/request-code",
    payload,
  );
  return data;
}

export async function verifySignupCode(payload: SignupVerifyCodePayload): Promise<SessionPayload> {
  const { data } = await apiClient.post<SessionPayload>("/api/v1/auth/signup/verify-code", payload);
  return data;
}

export async function verifySignupLink(payload: SignupVerifyLinkPayload): Promise<SessionPayload> {
  const { data } = await apiClient.post<SessionPayload>("/api/v1/auth/signup/verify-link", payload);
  return data;
}

export async function verifySignupPassword(
  payload: SignupVerifyPasswordPayload,
): Promise<SessionPayload> {
  const { data } = await apiClient.post<SessionPayload>(
    "/api/v1/auth/signup/verify-password",
    payload,
  );
  return data;
}

export async function login(payload: LoginPayload): Promise<SessionPayload> {
  const { data } = await apiClient.post<SessionPayload>("/api/v1/auth/login", payload);
  return data;
}

export async function loginWithGoogle(payload: GoogleSessionPayload): Promise<SessionPayload> {
  const { data } = await apiClient.post<SessionPayload>("/api/v1/auth/google/session", payload);
  return data;
}

export async function getAdminOverview(accessCode: string): Promise<AdminOverviewPayload> {
  const { data } = await apiClient.get<AdminOverviewPayload>("/api/v1/admin/overview", {
    headers: {
      "x-admin-code": accessCode,
    },
    timeout: 30_000,
  });
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

export async function updateAvatarUrl(payload: AvatarUpdatePayload): Promise<SessionPayload> {
  const { data } = await apiClient.post<SessionPayload>("/api/v1/auth/avatar", payload);
  return data;
}

export async function updateProfile(payload: ProfileUpdatePayload): Promise<SessionPayload> {
  const { data } = await apiClient.post<SessionPayload>("/api/v1/auth/profile", payload);
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

export async function generateAiTrendMap(
  payload: AiTrendMapperPayload,
): Promise<AiTrendMapperResponse> {
  const { data } = await apiClient.post<AiTrendMapperResponse>("/api/v1/ai/trend-mapper", payload, {
    timeout: 60_000,
  });
  return data;
}

export async function getIntelligenceFeed(
  userId: number,
  params?: { platform?: string; limit?: number },
): Promise<IntelligenceFeedResponse> {
  const { data } = await apiClient.get<IntelligenceFeedResponse>(
    `/api/v1/intelligence/feed/${userId}`,
    {
      params,
      timeout: 60_000,
    },
  );
  return data;
}

export async function refreshIntelligence(
  payload: IntelligenceRefreshPayload,
): Promise<{ created: number; interests: string[]; generated_at: string }> {
  const { data } = await apiClient.post<{
    created: number;
    interests: string[];
    generated_at: string;
  }>("/api/v1/intelligence/refresh", payload, { timeout: 60_000 });
  return data;
}

export async function submitIntelligenceFeedback(
  payload: IntelligenceFeedbackPayload,
): Promise<{ trend_signal_id: number; action: string; status: string }> {
  const { data } = await apiClient.post<{
    trend_signal_id: number;
    action: string;
    status: string;
  }>("/api/v1/intelligence/feedback", payload, { timeout: 30_000 });
  return data;
}

export async function composeAiContent(payload: AiComposePayload): Promise<AiComposeResponse> {
  const { data } = await apiClient.post<AiComposeResponse>("/api/v1/ai/compose", payload, {
    timeout: 60_000,
  });
  return data;
}

export async function generateAiVoiceover(
  payload: AiVoiceoverPayload,
): Promise<AiVoiceoverResponse> {
  const { data } = await apiClient.post<AiVoiceoverResponse>("/api/v1/ai/voiceover", payload, {
    timeout: 60_000,
  });
  return data;
}

export async function generateAiVoiceoverAudio(payload: AiVoiceoverAudioPayload): Promise<Blob> {
  const { data } = await apiClient.post<Blob>("/api/v1/ai/voiceover/audio", payload, {
    timeout: 120_000,
    responseType: "blob",
  });
  return data;
}

export async function chatWithAiAssistant(
  payload: AiAssistantPayload,
): Promise<AiAssistantResponse> {
  const { data } = await apiClient.post<AiAssistantResponse>("/api/v1/ai/assistant", payload, {
    timeout: 60_000,
  });
  return data;
}

export async function listAiAssistantChats(
  userId: number,
  email?: string,
): Promise<AiAssistantChatSummary[]> {
  const { data } = await apiClient.get<AiAssistantChatSummary[]>(
    `/api/v1/ai/assistant/chats/${userId}`,
    {
      params: email ? { email } : undefined,
    },
  );
  return data;
}

export async function getAiAssistantChatHistory(
  userId: number,
  chatId: string,
  email?: string,
): Promise<AiAssistantChatHistory> {
  const { data } = await apiClient.get<AiAssistantChatHistory>(
    `/api/v1/ai/assistant/chats/${userId}/${chatId}`,
    {
      params: email ? { email } : undefined,
    },
  );
  return data;
}

export async function createAiAssistantChat(
  userId: number,
  payload: AiAssistantChatCreatePayload,
  email?: string,
): Promise<AiAssistantChatSummary> {
  const { data } = await apiClient.post<AiAssistantChatSummary>(
    `/api/v1/ai/assistant/chats/${userId}`,
    payload,
    {
      params: email ? { email } : undefined,
    },
  );
  return data;
}

export async function updateAiAssistantChat(
  userId: number,
  chatId: string,
  payload: AiAssistantChatCreatePayload,
  email?: string,
): Promise<AiAssistantChatSummary> {
  const { data } = await apiClient.patch<AiAssistantChatSummary>(
    `/api/v1/ai/assistant/chats/${userId}/${chatId}`,
    payload,
    {
      params: email ? { email } : undefined,
    },
  );
  return data;
}

export async function deleteAiAssistantChat(
  userId: number,
  chatId: string,
  email?: string,
): Promise<void> {
  await apiClient.delete(`/api/v1/ai/assistant/chats/${userId}/${chatId}`, {
    params: email ? { email } : undefined,
  });
}

export type PlatformConnection = {
  id: number;
  platform: string;
  handle: string;
  active: boolean;
  sync_status?: "synced" | "syncing" | "disconnected";
  connection_method?: "manual" | "oauth";
  profile_url?: string | null;
};

export type PlatformConnectPayload = {
  platform: string;
  handle: string;
  profile_url?: string | null;
};

export type OAuthProvidersResponse = {
  configured: string[];
  all: string[];
};

export type OAuthStartResponse = {
  auth_url: string;
  redirect_uri: string;
};

export type PublishPostPayload = {
  user_id: number;
  post_id: number;
  platforms?: string[] | null;
};

export type PublishResult = {
  success: boolean;
  post_id?: string | null;
  post_url?: string | null;
  error?: string | null;
};

export type PublishPostResponse = {
  post_id: number;
  published: boolean;
  results: Record<string, PublishResult>;
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
  payload: PlatformConnectPayload,
): Promise<PlatformConnection> {
  const { data } = await apiClient.post<PlatformConnection>(
    `/api/v1/platforms/${userId}/connect`,
    payload,
  );
  return data;
}

export async function disconnectPlatform(userId: number, platformId: number): Promise<void> {
  await apiClient.delete(`/api/v1/platforms/${userId}/${platformId}`);
}

export async function getOAuthProviders(): Promise<OAuthProvidersResponse> {
  const { data } = await apiClient.get<OAuthProvidersResponse>("/api/v1/social/oauth/providers");
  return data;
}

export async function startPlatformOAuth(
  userId: number,
  platform: string,
): Promise<OAuthStartResponse> {
  const { data } = await apiClient.get<OAuthStartResponse>(
    `/api/v1/social/oauth/${platform}/start`,
    { params: { user_id: userId } },
  );
  return data;
}

export async function publishPost(payload: PublishPostPayload): Promise<PublishPostResponse> {
  const { data } = await apiClient.post<PublishPostResponse>("/api/v1/social/publish", payload, {
    timeout: 60_000,
  });
  return data;
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
