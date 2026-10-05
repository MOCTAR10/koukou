import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function CaisseRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/pos?tab=CAISSE');
  }, [router]);
  return null;
}