import { useNavigate } from 'react-router-dom';

export function useGoToError() {
  const navigate = useNavigate();
  return (error) => {
    if (error?.code === 'PAYMENT_REQUIRED') navigate('/paywall');
    else if (error?.code === 'KYC_REQUIRED' || error?.code === 'EMAIL_UNVERIFIED') navigate('/verify-identity');
    else if (error?.code === 'PROFILE_REQUIRED') navigate('/onboarding');
  };
}
