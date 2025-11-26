import "./SignInPage.css";
import SignInForm from "../components/SignInForm";
import { BackgroundBoxes } from "../components/ui/BackgroundBoxes.jsx";

function SignInPage() {
  return (
    <div className="sign-in-wrapper">
      <BackgroundBoxes className="sign-in-background" />
      <div className="modal sign-in-modal">
        <h1>Welcome back</h1>
        <p>Log in to Homelab Insights</p>
        <SignInForm />
      </div>
    </div>
  );
}

export default SignInPage;
