import { toast } from "sonner";

/**
 * Standardized API Error class matching the backend's GraspMindAIError structure.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public type?: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = type || "ApiError";
  }
}

/**
 * Parses the response data into a standardized ApiError.
 * Handles both the new GraspMindAIError format and fallback default formats.
 */
export function extractApiError(status: number, data: any): ApiError {
  // New backend custom GraspMindAIError format: { error: { message, type, details } }
  if (data?.error?.message) {
    return new ApiError(
      status,
      data.error.message,
      data.error.type,
      data.error.details
    );
  }

  // Old FastAPI default or basic error payload: { detail: "..." }
  if (data?.detail) {
    const message =
      typeof data.detail === "string"
        ? data.detail
        : JSON.stringify(data.detail);
    return new ApiError(status, message);
  }

  // Fallback
  return new ApiError(status, data?.message || "An unknown error occurred");
}

/**
 * A global utility to catch and display errors to the user via Sonner toasts.
 * Use this in try/catch blocks within components or hooks.
 */
export function handleError(error: unknown, fallbackMessage = "An unexpected error occurred.") {
  console.error("Caught error:", error);

  if (error instanceof ApiError) {
    toast.error(error.message, {
      description: error.type ? `Error: ${error.type}` : undefined,
    });
    return;
  }

  if (error instanceof Error) {
    toast.error(fallbackMessage, {
      description: error.message,
    });
    return;
  }

  toast.error(fallbackMessage);
}
