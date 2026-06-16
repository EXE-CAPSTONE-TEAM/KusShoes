import { FormEvent, useEffect, useState } from "react";
import { AuthPage } from "./components/site/AuthPage";
import { api, ApiError } from "./api/client";
import type { User } from "./types";

export function App({
  route,
  onNavigate,
}: {
  route: "login" | "register" | "studio";
  onNavigate: (path: string) => void;
}) {
  const [user, setUser] = useState<User | null>(null);
  const authMode: "login" | "register" = route === "register" ? "register" : "login";
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Ready");

  useEffect(() => {
    // We rely on HTTP-only cookies now, but we can check if the session is valid
    api
      .me()
      .then(setUser)
      .catch(() => {
        // Not logged in
      });
  }, []);

  useEffect(() => {
    if (user && route !== "studio") {
      onNavigate("/studio");
    }
  }, [user, route, onNavigate]);

  useEffect(() => {
    if (user && route === "studio") {
      redirectUserToEditor();
    }
  }, [user, route]);

  const redirectUserToEditor = async () => {
    try {
      setIsAuthBusy(true);
      setStatusMessage("Preparing your studio workspace...");
      const project = await api.createProject({
        name: "My Custom Shoe",
        sourceType: "uploaded_glb"
      });
      // Redirect to the BE editor URL
      const editorBaseUrl = import.meta.env.VITE_EDITOR_BASE_URL ?? `http://${window.location.hostname}:5180`;
      window.location.href = `${editorBaseUrl}/editor/${project.id}`;
    } catch (err) {
      if (err instanceof ApiError) {
        setStatusMessage(err.message);
      } else {
        setStatusMessage("Failed to prepare workspace.");
      }
      setIsAuthBusy(false);
    }
  };

  const handleAuthSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsAuthBusy(true);
    setStatusMessage("Authenticating...");
    try {
      let loggedInUser: User;
      if (authMode === "register") {
        loggedInUser = await api.register(authName, authEmail, authPassword);
      } else {
        loggedInUser = await api.login(authEmail, authPassword);
      }
      setUser(loggedInUser);
      onNavigate("/studio");
    } catch (err) {
      if (err instanceof ApiError) {
        setStatusMessage(err.message);
      } else {
        setStatusMessage("Network error");
      }
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleDemoAuth = async () => {
    setIsAuthBusy(true);
    setStatusMessage("Starting demo...");
    try {
      const loggedInUser = await api.demoLogin();
      setUser(loggedInUser);
      onNavigate("/studio");
    } catch (err) {
      if (err instanceof ApiError) {
        setStatusMessage(err.message);
      } else {
        setStatusMessage("Demo unavailable");
      }
      setIsAuthBusy(false);
    }
  };

  return (
    <AuthPage
      mode={authMode}
      name={authName}
      email={authEmail}
      password={authPassword}
      isBusy={isAuthBusy}
      statusMessage={statusMessage}
      onModeChange={(m) => onNavigate(`/${m}`)}
      onNameChange={setAuthName}
      onEmailChange={setAuthEmail}
      onPasswordChange={setAuthPassword}
      onSubmit={handleAuthSubmit}
      onDemoAuth={handleDemoAuth}
      onBack={() => onNavigate("/")}
    />
  );
}
