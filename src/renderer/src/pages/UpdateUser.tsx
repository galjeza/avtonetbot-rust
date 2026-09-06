import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import type { UserData } from '@shared/types';

export default function UpdateUser(): JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [chromePath, setChromePath] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const stored = window.api.store.get('userData') as UserData | undefined;
    if (stored) {
      setEmail(stored.email ?? '');
      setPassword(stored.password ?? '');
      setChromePath(stored.chromePath ?? '');
    }
  }, []);

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const existing = (window.api.store.get('userData') as UserData | undefined) ?? {
      email: '',
      password: '',
    };
    // Keep brokerId and subscription details; they come from the licence
    // server, not from this form.
    await window.api.saveUserData({ ...existing, email, password, chromePath });
    navigate('/');
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-900">
      <form className="rounded-lg bg-gray-800 p-5" onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="mb-2 block text-gray-200" htmlFor="email">
            Email
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg bg-gray-700 p-2 text-gray-300"
            required
          />
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-gray-200" htmlFor="password">
            Geslo
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg bg-gray-700 p-2 text-gray-300"
            required
          />
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-gray-200" htmlFor="chromePath">
            Pot do Chroma (neobvezno)
          </label>
          <input
            type="text"
            id="chromePath"
            value={chromePath}
            onChange={(e) => setChromePath(e.target.value)}
            className="w-full rounded-lg bg-gray-700 p-2 text-gray-300"
          />
        </div>

        <button
          type="submit"
          className="mr-3 rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-700"
        >
          Posodobi
        </button>
        <button
          type="button"
          className="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-700"
          onClick={() => navigate('/')}
        >
          Prekliči
        </button>
      </form>
    </div>
  );
}
