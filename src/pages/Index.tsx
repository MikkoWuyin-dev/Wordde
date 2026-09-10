import { OperatorScreen } from '@/components/operator/OperatorScreen';
import { MobileBlocker } from '@/components/MobileBlocker';

const Index = () => {
  return (
    <MobileBlocker>
      <OperatorScreen />
    </MobileBlocker>
  );
};

export default Index;
