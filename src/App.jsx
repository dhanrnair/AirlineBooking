import { Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import Home from './pages/Home';
import Flight from './pages/Flight';
import Manage from './pages/Manage';
import Account from './pages/Account';
import MyBookings from './pages/MyBookings';

export default function App() {
  return (
    <>
      <Header />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/flights/:id" element={<Flight />} />
          <Route path="/manage" element={<Manage />} />
          <Route path="/my-bookings" element={<MyBookings />} />
          <Route path="/signin" element={<Account mode="signin" />} />
          <Route path="/signup" element={<Account mode="signup" />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
      <footer className="container muted small footer">Demo project: no real payments are taken and no real tickets are issued.</footer>
    </>
  );
}
