import { Link, NavLink } from 'react-router-dom';
import { signOut, useSession } from '../services/auth';

export default function Header() {
  const { data: session, isPending } = useSession();
  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="logo">✈ Skyline Air</Link>
        <nav>
          <NavLink to="/" end>Search flights</NavLink>
          <NavLink to="/manage">Manage booking</NavLink>
          {!isPending && (session ? (
            <>
              <NavLink to="/my-bookings">My bookings</NavLink>
              <span className="muted small">{session.user.name}</span>
              <button type="button" className="link-button" onClick={() => signOut()}>Sign out</button>
            </>
          ) : (
            <NavLink to="/signin">Sign in</NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
