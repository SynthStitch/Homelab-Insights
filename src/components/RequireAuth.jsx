import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function RequireAuth({ children, role }) {
  const { auth } = useAuth();
  const location = useLocation();

  if (!auth?.token) {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }
  if (role && auth?.payload?.role !== role) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export default RequireAuth;
