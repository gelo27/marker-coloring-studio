/* GLSL sources live in ./shaders; the noise helpers are shared by the paper and desk shaders */
import vert from './shaders/common.vert?raw';
import noise from './shaders/noise.glsl?raw';
import paper from './shaders/paper.frag?raw';
import desk from './shaders/desk.frag?raw';
import post from './shaders/post.frag?raw';
const inc=s=>s.replace('#include noise',noise);
export const VERT=vert,PAPER_FRAG=inc(paper),DESK_FRAG=inc(desk),POST_FRAG=post;
