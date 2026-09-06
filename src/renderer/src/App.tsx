import { MemoryRouter as Router, Route, Routes } from 'react-router-dom';

import { MAINTENANCE_MESSAGE, MAINTENANCE_MODE, MAINTENANCE_TITLE } from './config';
import AdList from './pages/AdList';
import Menu from './pages/Menu';
import Obnavljanje from './pages/Obnavljanje';
import UpdateUser from './pages/UpdateUser';

export default function App(): JSX.Element {
  if (MAINTENANCE_MODE) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 px-6 text-white">
        <div className="w-full max-w-xl rounded-lg bg-gray-800 p-6 text-center shadow-md">
          <h1 className="mb-4 text-2xl font-semibold">{MAINTENANCE_TITLE}</h1>
          <p className="whitespace-pre-line text-gray-200">{MAINTENANCE_MESSAGE}</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Menu />} />
        <Route path="/adlist" element={<AdList />} />
        <Route path="/update" element={<UpdateUser />} />
        <Route path="/obnavljanje" element={<Obnavljanje />} />
      </Routes>
    </Router>
  );
}
