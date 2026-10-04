/*
 * Browser stand-in for <GL/freeglut.h>, so the original 2021 main.cpp compiles
 * unchanged with Emscripten. It implements the small OpenGL 1.x / GLUT subset
 * the game uses on top of an HTML canvas (2D context):
 *
 *   matrices    glMatrixMode, glPushMatrix, glPopMatrix, gluOrtho2D,
 *               glTranslate{f,d}, glRotated (z axis), glScale{f,d}
 *   drawing     glClearColor, glClear, glColor3f, glRecti, glBegin/glEnd with
 *               GL_LINES, GL_LINE_LOOP, GL_POLYGON, glVertex2{s,i,f}
 *   text        glRasterPos2i + glutBitmapCharacter (canvas fillText)
 *   no-ops      glPolygonMode, glLineWidth (only called inside glBegin/glEnd,
 *               where desktop GL ignores it), glFlush, glutPostRedisplay
 *   GLUT        window setup, glutDisplayFunc, glutMouseFunc, glutMainLoop
 */
#pragma once
#include <cmath>
#include <emscripten.h>
#include <emscripten/html5.h>

typedef int GLint;
typedef short GLshort;
typedef float GLfloat;
typedef double GLdouble;
typedef unsigned int GLenum;
typedef unsigned int GLbitfield;

#define GL_COLOR_BUFFER_BIT 0x4000
#define GL_LINES 0x0001
#define GL_LINE_LOOP 0x0002
#define GL_POLYGON 0x0009
#define GL_MODELVIEW 0x1700
#define GL_PROJECTION 0x1701
#define GL_FRONT_AND_BACK 0x0408
#define GL_FILL 0x1B02

#define GLUT_SINGLE 0
#define GLUT_RGB 0
#define GLUT_LEFT_BUTTON 0
#define GLUT_MIDDLE_BUTTON 1
#define GLUT_RIGHT_BUTTON 2
#define GLUT_DOWN 0
#define GLUT_UP 1
#define GLUT_BITMAP_HELVETICA_18 ((void *)8)

/* ---- state ------------------------------------------------------------ */

/* 2D affine matrix: x' = a*x + c*y + e, y' = b*x + d*y + f */
struct ShimMat { double a, b, c, d, e, f; };
static const ShimMat SHIM_IDENTITY = {1, 0, 0, 1, 0, 0};

static ShimMat shim_stack[2][32] = {{SHIM_IDENTITY}, {SHIM_IDENTITY}};
static int shim_top[2] = {0, 0};
static int shim_mode = 0; /* 0 = modelview, 1 = projection */

static float shim_rgb[3] = {0, 0, 0};
static float shim_clear[3] = {0, 0, 0};
static float shim_raster[2] = {0, 0};
static float shim_raster_rgb[3] = {0, 0, 0};

static GLenum shim_prim = 0;
static float shim_verts[256 * 2];
static int shim_nverts = 0;

static void (*shim_display_cb)(void) = 0;
static void (*shim_mouse_cb)(int, int, int, int) = 0;

static inline ShimMat shim_mul(const ShimMat &m, const ShimMat &n) {
  return {m.a * n.a + m.c * n.b, m.b * n.a + m.d * n.b,
          m.a * n.c + m.c * n.d, m.b * n.c + m.d * n.d,
          m.a * n.e + m.c * n.f + m.e, m.b * n.e + m.d * n.f + m.f};
}
static inline ShimMat &shim_cur() { return shim_stack[shim_mode][shim_top[shim_mode]]; }
static inline void shim_apply(const ShimMat &n) { shim_cur() = shim_mul(shim_cur(), n); }

/* world -> canvas pixels: projection * modelview */
static inline void shim_xform(double x, double y, float *ox, float *oy) {
  ShimMat t = shim_mul(shim_stack[1][shim_top[1]], shim_stack[0][shim_top[0]]);
  *ox = (float)(t.a * x + t.c * y + t.e);
  *oy = (float)(t.b * x + t.d * y + t.f);
}

/* ---- canvas side ------------------------------------------------------ */

EM_JS(void, shim_js_clear, (float r, float g, float b), {
  const c = Module.canvas, ctx = c.getContext('2d');
  ctx.fillStyle = 'rgb(' + Math.round(r * 255) + ',' + Math.round(g * 255) + ',' + Math.round(b * 255) + ')';
  ctx.fillRect(0, 0, c.width, c.height);
});

/* mode: 0 = filled polygon, 1 = separate line segments, 2 = closed line loop */
EM_JS(void, shim_js_draw, (const float *pts, int n, int mode, float r, float g, float b), {
  const ctx = Module.canvas.getContext('2d');
  const col = 'rgb(' + Math.round(r * 255) + ',' + Math.round(g * 255) + ',' + Math.round(b * 255) + ')';
  const p = HEAPF32.subarray(pts >> 2, (pts >> 2) + n * 2);
  ctx.beginPath();
  if (mode === 1) {
    for (let i = 0; i + 1 < n; i += 2) { ctx.moveTo(p[i * 2], p[i * 2 + 1]); ctx.lineTo(p[i * 2 + 2], p[i * 2 + 3]); }
  } else {
    ctx.moveTo(p[0], p[1]);
    for (let i = 1; i < n; i++) ctx.lineTo(p[i * 2], p[i * 2 + 1]);
    ctx.closePath();
  }
  if (mode === 0) { ctx.fillStyle = col; ctx.fill(); }
  else { ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke(); }
});

EM_JS(void, shim_js_char, (float x, float y, int ch, float r, float g, float b), {
  const ctx = Module.canvas.getContext('2d');
  ctx.font = '18px Helvetica, Arial, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgb(' + Math.round(r * 255) + ',' + Math.round(g * 255) + ',' + Math.round(b * 255) + ')';
  ctx.fillText(String.fromCharCode(ch), x, y);
});

/* ---- OpenGL subset ---------------------------------------------------- */

static inline void shim_glMatrixMode(GLenum m) { shim_mode = (m == GL_PROJECTION) ? 1 : 0; }
static inline void shim_glPushMatrix() { int &t = shim_top[shim_mode]; if (t < 31) { shim_stack[shim_mode][t + 1] = shim_stack[shim_mode][t]; t++; } }
static inline void shim_glPopMatrix() { int &t = shim_top[shim_mode]; if (t > 0) t--; }
static inline void shim_glTranslate(double x, double y) { shim_apply({1, 0, 0, 1, x, y}); }
static inline void shim_glScale(double x, double y) { shim_apply({x, 0, 0, y, 0, 0}); }
static inline void shim_glRotated(double deg, double, double, double z) {
  double r = deg * 3.14159265358979323846 / 180.0 * (z < 0 ? -1 : 1);
  shim_apply({std::cos(r), std::sin(r), -std::sin(r), std::cos(r), 0, 0});
}
/* gluOrtho2D maps (l..r, b..t) straight to canvas pixels (y flipped). */
static inline void shim_gluOrtho2D(double l, double r, double b, double t) {
  double w = 1200.0, h = 800.0;
  shim_apply({w / (r - l), 0, 0, -h / (t - b), -l * w / (r - l), h + b * h / (t - b)});
}

static inline void shim_glClearColor(float r, float g, float b, float) { shim_clear[0] = r; shim_clear[1] = g; shim_clear[2] = b; }
static inline void shim_glClear(GLbitfield) { shim_js_clear(shim_clear[0], shim_clear[1], shim_clear[2]); }
static inline void shim_glColor3f(float r, float g, float b) { shim_rgb[0] = r; shim_rgb[1] = g; shim_rgb[2] = b; }

static inline void shim_glBegin(GLenum mode) { shim_prim = mode; shim_nverts = 0; }
static inline void shim_glVertex(double x, double y) {
  if (shim_nverts < 256) { shim_xform(x, y, &shim_verts[shim_nverts * 2], &shim_verts[shim_nverts * 2 + 1]); shim_nverts++; }
}
static inline void shim_glEnd() {
  if (shim_nverts == 0) return;
  int mode = shim_prim == GL_LINES ? 1 : shim_prim == GL_LINE_LOOP ? 2 : 0;
  shim_js_draw(shim_verts, shim_nverts, mode, shim_rgb[0], shim_rgb[1], shim_rgb[2]);
  shim_nverts = 0;
}
static inline void shim_glRecti(int x1, int y1, int x2, int y2) {
  shim_glBegin(GL_POLYGON);
  shim_glVertex(x1, y1); shim_glVertex(x2, y1); shim_glVertex(x2, y2); shim_glVertex(x1, y2);
  shim_glEnd();
}

static inline void shim_glRasterPos2i(int x, int y) {
  shim_xform(x, y, &shim_raster[0], &shim_raster[1]);
  shim_raster_rgb[0] = shim_rgb[0]; shim_raster_rgb[1] = shim_rgb[1]; shim_raster_rgb[2] = shim_rgb[2];
}
static inline void shim_glutBitmapCharacter(void *, int ch) {
  shim_js_char(shim_raster[0], shim_raster[1], ch, shim_raster_rgb[0], shim_raster_rgb[1], shim_raster_rgb[2]);
}

/* ---- GLUT subset ------------------------------------------------------ */

static inline void shim_glutInit(int *, char **) {}
static inline void shim_glutDisplayFunc(void (*f)(void)) { shim_display_cb = f; }
static inline void shim_glutMouseFunc(void (*f)(int, int, int, int)) { shim_mouse_cb = f; }

static EM_BOOL shim_on_mouse(int, const EmscriptenMouseEvent *e, void *) {
  if (!shim_mouse_cb) return EM_FALSE;
  double cw, ch;
  emscripten_get_element_css_size("#canvas", &cw, &ch);
  int x = (int)(e->targetX * 1200.0 / cw), y = (int)(e->targetY * 800.0 / ch);
  int button = e->button == 2 ? GLUT_RIGHT_BUTTON : e->button == 1 ? GLUT_MIDDLE_BUTTON : GLUT_LEFT_BUTTON;
  shim_mouse_cb(button, GLUT_DOWN, x, y);
  return EM_TRUE;
}

static inline void shim_frame() { if (shim_display_cb) shim_display_cb(); }

static inline void shim_glutMainLoop() {
  emscripten_set_mousedown_callback("#canvas", 0, EM_TRUE, shim_on_mouse);
  emscripten_set_main_loop(shim_frame, 0, 1);
}

#define glMatrixMode shim_glMatrixMode
#define glPushMatrix shim_glPushMatrix
#define glPopMatrix shim_glPopMatrix
#define glTranslatef(x, y, z) shim_glTranslate((x), (y))
#define glTranslated(x, y, z) shim_glTranslate((x), (y))
#define glScalef(x, y, z) shim_glScale((x), (y))
#define glScaled(x, y, z) shim_glScale((x), (y))
#define glRotated shim_glRotated
#define gluOrtho2D shim_gluOrtho2D
#define glClearColor shim_glClearColor
#define glClear shim_glClear
#define glColor3f shim_glColor3f
#define glBegin shim_glBegin
#define glEnd shim_glEnd
#define glVertex2s(x, y) shim_glVertex((x), (y))
#define glVertex2i(x, y) shim_glVertex((x), (y))
#define glVertex2f(x, y) shim_glVertex((x), (y))
#define glRecti shim_glRecti
#define glRasterPos2i shim_glRasterPos2i
#define glutBitmapCharacter shim_glutBitmapCharacter
#define glPolygonMode(face, mode) ((void)0)
#define glLineWidth(w) ((void)0)
#define glFlush() ((void)0)
#define glutPostRedisplay() ((void)0)
#define glutInit shim_glutInit
#define glutInitDisplayMode(m) ((void)0)
#define glutInitWindowPosition(x, y) ((void)0)
#define glutInitWindowSize(w, h) ((void)0)
#define glutCreateWindow(title) ((void)0)
#define glutDisplayFunc shim_glutDisplayFunc
#define glutMouseFunc shim_glutMouseFunc
#define glutMainLoop shim_glutMainLoop
