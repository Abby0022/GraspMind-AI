/**
 * Type-safe API client for the FastAPI backend.
 * All requests include credentials (cookies) for auth.
 */

import { ApiError, extractApiError } from "./errors";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}/api/v1${path}`;

  const response = await fetch(url, {
    ...options,
    credentials: "include", // Send cookies
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ detail: "Failed to parse error response" }));
    throw extractApiError(response.status, errorData);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// -- Auth ----------------------------------------------------

export const api = {
  auth: {
    signup: (data: { email: string; password: string; name: string; teacher_code?: string }) =>
      request("/auth/signup", { method: "POST", body: JSON.stringify(data) }),

    login: (data: { email: string; password: string }) =>
      request("/auth/login", { method: "POST", body: JSON.stringify(data) }),

    logout: () => request("/auth/logout", { method: "POST" }),

    me: () => request("/auth/me"),
  },

  // -- Notebooks ------------------------------------------─
  notebooks: {
    list: () => request("/notebooks/"),

    get: (id: string) => request(`/notebooks/${id}`),

    create: (data: {
      title: string;
      subject?: string;
      color?: string;
      exam_date?: string;
    }) =>
      request("/notebooks/", { method: "POST", body: JSON.stringify(data) }),

    update: (
      id: string,
      data: { title?: string; subject?: string; color?: string },
    ) =>
      request(`/notebooks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    delete: (id: string) => request(`/notebooks/${id}`, { method: "DELETE" }),
  },

  // -- Teacher: Classes ----------------------------------------
  classes: {
    list: () => request<ClassListItem[]>("/classes"),

    get: (classId: string) => request<ClassDetail>(`/classes/${classId}`),

    create: (data: { name: string; subject?: string }) =>
      request<ClassDetail>("/classes", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    update: (classId: string, data: { name?: string; subject?: string }) =>
      request<ClassDetail>(`/classes/${classId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    delete: (classId: string) =>
      request(`/classes/${classId}`, { method: "DELETE" }),

    join: (invite_code: string) =>
      request("/classes/join", {
        method: "POST",
        body: JSON.stringify({ invite_code }),
      }),

    members: (classId: string) =>
      request<ClassMember[]>(`/classes/${classId}/members`),

    analytics: (classId: string) =>
      request<ClassAnalytics>(`/classes/${classId}/analytics`),
  },

  // -- Teacher: Assignments ------------------------------------
  assignments: {
    list: (classId: string) =>
      request<Assignment[]>(`/classes/${classId}/assignments`),

    get: (assignmentId: string) =>
      request<Assignment>(`/assignments/${assignmentId}`),

    create: (
      classId: string,
      data: {
        title: string;
        type: "read" | "quiz" | "flashcard";
        description?: string;
        notebook_id?: string;
        due_date?: string;
      },
    ) =>
      request<Assignment>(`/classes/${classId}/assignments`, {
        method: "POST",
        body: JSON.stringify(data),
      }),

    submit: (
      assignmentId: string,
      data: { status: "pending" | "in_progress" | "submitted"; score?: number },
    ) =>
      request(`/assignments/${assignmentId}/submit`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    submissions: (assignmentId: string) =>
      request(`/assignments/${assignmentId}/submissions`),
  },
};

// -- Teacher Portal Types ------------------------------------─

export interface ClassListItem {
  id: string;
  name: string;
  subject: string | null;
  created_at: string;
}

export interface ClassDetail extends ClassListItem {
  teacher_id: string;
  invite_code: string;
}

export interface ClassMember {
  student_id: string;
  name: string;
  email: string;
  avg_mastery: number;
  joined_at: string;
}

export interface ClassAnalytics {
  class_id: string;
  class_name: string;
  student_count: number;
  avg_mastery: number;
  weakest_concepts: string[];
  assignment_completion_rate: number;
  per_student: {
    student_id: string;
    name: string;
    email: string;
    avg_mastery: number;
    quizzes_done: number;
    joined_at: string;
  }[];
}

export interface Assignment {
  id: string;
  class_id: string;
  notebook_id: string | null;
  title: string;
  description: string | null;
  type: "read" | "quiz" | "flashcard";
  due_date: string | null;
  created_at: string;
  my_submission?: {
    status: string;
    score: number | null;
    submitted_at: string | null;
  } | null;
}

