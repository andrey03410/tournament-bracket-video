import { notFound } from "next/navigation";
import { currentUser } from "@/auth";
import { can } from "@/lib/domain/permissions";
import { AdminUsers } from "./AdminUsers";

export default async function AdminPage() {
  const user = await currentUser();
  // 404 (not 403/redirect) so the page's existence isn't advertised.
  if (!user || !can(user.role, "admin:users")) notFound();

  return (
    <div className="container">
      <h1>Админка — пользователи</h1>
      <AdminUsers selfId={user.id} />
    </div>
  );
}
