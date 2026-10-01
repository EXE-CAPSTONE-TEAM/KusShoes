// framer-motion's animation features, split out of the landing bundle: Landing renders the
// lightweight `m` components inside <LazyMotion features={loadMotionFeatures}>, and the
// features (~100 KB) load after the first render. Everything they animate starts below the fold.
import { domAnimation } from 'framer-motion';

export default domAnimation;
