import NetworkApp from "@/components/NetworkApp";
import AuthGuard from "@/components/AuthGuard";

export default function Home() {
  return (
    <AuthGuard>
      <NetworkApp />
    </AuthGuard>
  );
}
