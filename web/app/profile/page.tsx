import type { Metadata } from "next";
import { ProfileView } from "@/components/profile-view";

export const metadata: Metadata = {
  title: "Profile · CareerOps",
};

export default function ProfilePage() {
  return <ProfileView />;
}
