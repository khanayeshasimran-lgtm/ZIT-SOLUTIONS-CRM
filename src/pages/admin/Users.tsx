import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { logAudit } from '@/lib/audit';
import { PageLoader } from '@/components/PageLoader';
import { useNavigate } from 'react-router-dom';

type UserRow = {
  id: string;
  email: string;
  role: string | null;
  created_at: string;
};

export default function Users() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Redirect non-admins — wait for profile to load before checking
  useEffect(() => {
    if (!profile) return;
    if (profile.role !== 'admin') {
      navigate('/dashboard', { replace: true });
    }
  }, [profile, navigate]);

  useEffect(() => {
    if (!user || !profile) return;

    if (profile.role === 'admin') {
      fetchUsers();
      logAudit({
        userId: user.id,
        userEmail: user.email,
        action: 'VIEW_USERS',
        entity: 'user_management',
      });
    } else {
      setLoading(false);
    }
  }, [user, profile]);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('profiles')
      .select('id, email, role, created_at')
      .order('created_at', { ascending: true });

    if (!error) setUsers((data ?? []) as UserRow[]);
    setLoading(false);
  };

  const handleRoleChange = async (
    targetUser: UserRow,
newRole: 'user' | 'admin' | 'manager' | 'investor'
  ) => {
    if (!user || !profile) return;
    if (targetUser.id === user.id) return;

    const oldRole = targetUser.role ?? 'user';
    if (oldRole === newRole) return;

    const { error } = await (supabase as any)
      .from('profiles')
      .update({ role: newRole })
      .eq('id', targetUser.id);

    if (error) {
      alert('Failed to update role');
      return;
    }

    logAudit({
      userId: user.id,
      userEmail: user.email,
      action: 'CHANGE_ROLE',
      entity: 'user_management',
      entityId: targetUser.id,
    });

    setUsers((prev) =>
      prev.map((u) => (u.id === targetUser.id ? { ...u, role: newRole } : u))
    );
  };

  if (loading) return <PageLoader />;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-semibold">Users</h1>

      {/* Mobile */}
      <div className="space-y-3 md:hidden">
        {users.map((u) => {
          const isSelf = u.id === user?.id;
          return (
            <div key={u.id} className="border rounded-lg p-4 space-y-2">
              <div className="text-sm font-medium break-all">{u.email}</div>
              <div className="flex items-center gap-2">
                <select
                  value={u.role ?? 'user'}
                  disabled={isSelf}
                  onChange={(e) =>
                    handleRoleChange(u, e.target.value as 'user' | 'admin' | 'manager')
                  }
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                </select>
                {isSelf && <span className="text-xs text-muted-foreground">(You)</span>}
              </div>
              <div className="text-xs text-muted-foreground">
                Joined: {new Date(u.created_at).toLocaleDateString()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop */}
      <div className="hidden md:block border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3 text-left">Email</th>
              <th className="p-3 text-left">Role</th>
              <th className="p-3 text-left">Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === user?.id;
              return (
                <tr key={u.id} className="border-t">
                  <td className="p-3">{u.email}</td>
                  <td className="p-3">
                    <select
                      value={u.role ?? 'user'}
                      disabled={isSelf}
                      onChange={(e) =>
                        handleRoleChange(u, e.target.value as 'user' | 'admin' | 'manager')
                      }
                      className={`border rounded px-2 py-1 ${
                        isSelf ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''
                      }`}
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                      <option value="investor">Investor</option>
                    </select>
                    {isSelf && (
                      <span className="ml-2 text-xs text-muted-foreground">(You)</span>
                    )}
                  </td>
                  <td className="p-3">{new Date(u.created_at).toLocaleDateString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}