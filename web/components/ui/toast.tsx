"use client";

import * as React from "react";
import { Button } from "@astryxdesign/core/Button";
import { useToast as useAstryxToast, ToastViewport } from "@astryxdesign/core/Toast";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

/**
 * App-level toast API (`toast.success(title, description)` etc.) rendered by
 * the Astryx toast system — positioning, stacking, auto-dismiss, swipe and
 * screen-reader announcements all come from Astryx. Errors stay until the
 * user dismisses them, so nobody misses a failure; other messages stay up for
 * ten seconds, long enough to read slowly. An optional action ("Try again")
 * sits on the toast itself.
 */

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastInput {
  title: string;
  description?: string;
  variant?: "success" | "error" | "info";
  /** Auto-dismiss after N ms (0 keeps it until closed). */
  duration?: number;
  action?: ToastAction;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
  success: (title: string, description?: string, action?: ToastAction) => void;
  error: (title: string, description?: string, action?: ToastAction) => void;
  info: (title: string, description?: string, action?: ToastAction) => void;
}

function ToastBody({ title, description }: { title: string; description?: string }) {
  return (
    <VStack gap={0.5}>
      <Text weight="semibold">{title}</Text>
      {description ? <Text color="secondary">{description}</Text> : null}
    </VStack>
  );
}

export function useToast(): ToastContextValue {
  const show = useAstryxToast();
  return React.useMemo<ToastContextValue>(() => {
    const toast = ({ title, description, variant = "info", duration, action }: ToastInput) => {
      const isError = variant === "error";
      // Read only when the action is pressed, after `show` has returned.
      const dismiss: () => void = show({
        body: <ToastBody title={title} description={description} />,
        type: isError ? "error" : "info",
        // A toast with an action waits for the person, like an error does.
        isAutoHide: duration === 0 || action ? false : !isError,
        autoHideDuration: duration && duration > 0 ? duration : 10000,
        endContent: action ? (
          <Button
            label={action.label}
            variant="secondary"
            onClick={() => {
              dismiss();
              action.onClick();
            }}
          />
        ) : undefined,
      });
    };
    return {
      toast,
      success: (title, description, action) =>
        toast({ title, description, variant: "success", action }),
      error: (title, description, action) => toast({ title, description, variant: "error", action }),
      info: (title, description, action) => toast({ title, description, variant: "info", action }),
    };
  }, [show]);
}

/** Mounts the Astryx toast viewport once at the app root. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  // On phones the bottom tab bar (64px + the home-indicator area) sits where
  // toasts land — lift them above it so neither hides the other.
  const [phone, setPhone] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Children render inside the viewport so `useToast()` resolves to it
  // (instead of Astryx's fallback body-mounted viewport).
  return (
    <ToastViewport position="bottomEnd" inset={phone ? { bottom: 88 } : undefined}>
      {children}
    </ToastViewport>
  );
}
