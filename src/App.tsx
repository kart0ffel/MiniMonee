import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DataProvider, useData } from './contexts/DataContext';
import Layout from './components/Layout';
import Welcome from './pages/Welcome';
import Setup from './pages/Setup';
import BalanceInput from './pages/BalanceInput';
import Overview from './pages/Overview';
import Expenses from './pages/Expenses';
import Performance from './pages/Performance';
import Pension from './pages/Pension';
import Waterfall from './pages/Waterfall';
import DataManager from './pages/DataManager';
import AddTransactions from './pages/AddTransactions';

function AppRoutes() {
  const { data } = useData();

  if (!data) {
    return (
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/overview" element={<Overview />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/performance" element={<Performance />} />
        <Route path="/pension" element={<Pension />} />
        <Route path="/waterfall" element={<Waterfall />} />
        <Route path="/input" element={<BalanceInput />} />
        <Route path="/transactions" element={<AddTransactions />} />
        <Route path="/accounts" element={<Setup />} />
<Route path="/data" element={<DataManager />} />
        <Route path="/welcome" element={<Navigate to="/overview" replace />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <DataProvider>
        <AppRoutes />
      </DataProvider>
    </BrowserRouter>
  );
}
