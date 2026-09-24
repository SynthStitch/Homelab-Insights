import "./SignInPage.css";
import SignInForm from "../components/SignInForm";

function SignInPage() {
  return (
    <div className="page signin">
      <div className="signin__card rise">
        <p className="eyebrow">access</p>
        <h1>Welcome back</h1>
        <p className="muted">Sign in to Homelab Insights.</p>
        <SignInForm />
      </div>
    </div>
  );
}

export default SignInPage;
