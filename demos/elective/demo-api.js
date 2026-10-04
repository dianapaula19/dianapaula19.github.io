/*
 * Demo backend for the elective course selection platform (BSc thesis, 2022).
 *
 * The React frontend is the original 2022 build, unchanged. In the real app it
 * talks to a Django REST backend; here this script answers the same requests in
 * the browser, with fictional demo data kept in sessionStorage (the app's sign-out
 * clears localStorage). Response shapes
 * and the seat assignment mirror the original Django views.
 *
 * Only requests to the placeholder host below are intercepted.
 */
(function () {
  'use strict';

  var HOST = 'demo.api.invalid';
  var STORE = 'elective-demo-state-v1';
  var DELAY = 250;

  /* ---- demo data -------------------------------------------------------- */

  function seed() {
    var teachers = [
      { email: 'lovelace@demo.example', first_name: 'Ada', last_name: 'Lovelace' },
      { email: 'turing@demo.example', first_name: 'Alan', last_name: 'Turing' }
    ];
    var studentRows = [
      ['Maria', 'Popescu', 9.6, 9.8], ['Andrei', 'Ionescu', 9.5, 9.4], ['Elena', 'Georgescu', 8.9, 9.1],
      ['Mihai', 'Stan', 8.8, 8.7], ['Ioana', 'Dumitru', 8.0, 8.2], ['Radu', 'Marin', 8.1, 7.9]
    ];
    var students = studentRows.map(function (r) {
      return {
        email: r[0].toLowerCase() + '.' + r[1].toLowerCase() + '@demo.example', first_name: r[0], last_name: r[1],
        domain: 'INFO', learning_mode: 'IF', degree: 'BACHELOR', study_program: 'INFO',
        current_group: '231', current_year: 2, grades: [{ grade: r[2], year: 1 }, { grade: r[3], year: 2 }]
      };
    });
    var courseRows = [
      ['Natural Language Processing', 0, 1], ['Computer Vision', 1, 1], ['Distributed Systems', 0, 1], ['Cryptography', 1, 1],
      ['Machine Learning', 1, 2], ['Human-Computer Interaction', 0, 2], ['Cloud Computing', 1, 2]
    ];
    var courses = courseRows.map(function (r, i) {
      return { id: i + 1, title: r[0], teacher_email: teachers[r[1]].email, capacity: 3, degree: 'BACHELOR',
               semester: r[2], link: 'https://en.wikipedia.org/wiki/' + r[0].replace(/ /g, '_'), students: [] };
    });
    var lists = [
      { id: 1, title: 'Year 3 electives (semester 1)', domain: 'INFO', learning_mode: 'IF', degree: 'BACHELOR',
        study_program: 'INFO', year: 3, semester: 1, courses: [1, 2, 3, 4] },
      { id: 2, title: 'Year 3 electives (semester 2)', domain: 'INFO', learning_mode: 'IF', degree: 'BACHELOR',
        study_program: 'INFO', year: 3, semester: 2, courses: [5, 6, 7] }
    ];
    /* everyone except the first student has already ranked their electives */
    var choices = {};
    var picks = [null, [[2, 1, 3, 4], [5, 7, 6]], [[1, 2, 4, 3], [5, 6, 7]], [[2, 4, 1, 3], [7, 5, 6]],
                 [[2, 1, 3, 4], [5, 6, 7]], [[3, 2, 1, 4], [6, 5, 7]]];
    students.forEach(function (s, i) {
      if (picks[i]) { choices[s.email] = { 1: picks[i][0], 2: picks[i][1] }; }
    });
    return {
      session_open: 'TRUE',
      admin: { email: 'admin@demo.example', first_name: 'Demo', last_name: 'Admin' },
      teachers: teachers, students: students, courses: courses, lists: lists, choices: choices,
      not_verified: ['new.student@demo.example', 'guest.lecturer@demo.example'],
      nextCourseId: 8, nextListId: 3
    };
  }

  function load() {
    try { var s = JSON.parse(sessionStorage.getItem(STORE)); if (s && s.courses) return s; } catch (e) {}
    var fresh = seed(); save(fresh); return fresh;
  }
  function save(s) { try { sessionStorage.setItem(STORE, JSON.stringify(s)); } catch (e) {} }

  /* ---- helpers mirroring the Django serializers ------------------------- */

  function teacherOf(s, email) { return s.teachers.filter(function (t) { return t.email === email; })[0]; }
  function courseOut(s, c) {
    var t = teacherOf(s, c.teacher_email) || { first_name: '', last_name: '', email: c.teacher_email };
    return { id: c.id, title: c.title, link: c.link, capacity: c.capacity, degree: c.degree, semester: c.semester,
             teacher_first_name: t.first_name, teacher_last_name: t.last_name, teacher_email: t.email };
  }
  function courseById(s, id) { return s.courses.filter(function (c) { return c.id === Number(id); })[0]; }
  function student(s, email) { return s.students.filter(function (x) { return x.email === email; })[0]; }
  function latestGrade(st) { var g = st.grades.slice().sort(function (a, b) { return b.year - a.year; })[0]; return g ? g.grade : 0; }
  function listFor(st) { return function (l) { return l.domain === st.domain && l.degree === st.degree && l.learning_mode === st.learning_mode && l.study_program === st.study_program; }; }

  /* Seat assignment, as in the original: students in grade order, each gets the
     highest-ranked course from the list that still has room. */
  function assignSeats(s) {
    s.courses.forEach(function (c) { c.students = []; });
    s.lists.forEach(function (l) {
      var members = s.students.filter(listFor(l)).sort(function (a, b) { return latestGrade(b) - latestGrade(a); });
      var leftovers = [];
      members.forEach(function (st) {
        var ranked = (s.choices[st.email] && s.choices[st.email][l.id]) || l.courses;
        var placed = ranked.some(function (id) {
          var c = courseById(s, id);
          if (c && c.students.length < c.capacity) { c.students.push(st.email); return true; }
          return false;
        });
        if (!placed) leftovers.push(st);
      });
      leftovers.forEach(function (st) {
        l.courses.some(function (id) {
          var c = courseById(s, id);
          if (c && c.students.length < c.capacity) { c.students.push(st.email); return true; }
          return false;
        });
      });
    });
  }

  /* ---- routes ----------------------------------------------------------- */

  function ok(body) { body.code = body.code || 'SUCCESS'; return [200, body]; }

  var routes = {
    '/api/user/login': function (s, b) {
      if (!b.email || !b.password) return [400, { code: 'NO_PASSWORD_OR_EMAIL_PROVIDED' }];
      var u = null, role = null;
      if (b.email === s.admin.email) { u = s.admin; role = 'ADMIN'; }
      else if (teacherOf(s, b.email)) { u = teacherOf(s, b.email); role = 'TEACHER'; }
      else if (student(s, b.email)) { u = student(s, b.email); role = 'STUDENT'; }
      if (!u) return [404, { code: 'INVALID_CREDENTIALS' }];
      return ok({ token: 'demo-token-' + role.toLowerCase(), selection_session_open: s.session_open,
                  user_data: { email: u.email, first_name: u.first_name, last_name: u.last_name, role: role } });
    },
    '/api/user/register': function () { return ok({}); },
    '/api/user/password_reset/': function () { return [200, { status: 'OK' }]; },
    '/api/user/password_reset/confirm/': function () { return [200, { status: 'OK' }]; },

    '/api/user/student/data': function (s, b) {
      var st = student(s, b.email);
      if (!st) return [404, { code: 'STUDENT_NOT_FOUND' }];
      return ok({ student_data: st });
    },
    '/api/course/student/get_student_options_lists': function (s, b) {
      var st = student(s, b.email);
      if (!st) return [404, { code: 'STUDENT_NOT_FOUND' }];
      var res = s.lists.filter(listFor(st)).map(function (l) {
        var ranked = (s.choices[st.email] && s.choices[st.email][l.id]) || l.courses;
        return { id: l.id, title: l.title, semester: l.semester,
                 courses: ranked.map(function (id) { return courseById(s, id); }).filter(Boolean).map(function (c) { return courseOut(s, c); }) };
      });
      return ok({ student_options_lists: res });
    },
    '/api/course/student/create_or_update_student_choices': function (s, b) {
      if (!student(s, b.email)) return [404, { code: 'STUDENT_NOT_FOUND' }];
      var ordered = (b.choices || []).slice().sort(function (x, y) { return x.order - y.order; }).map(function (c) { return Number(c.course_id); });
      s.choices[b.email] = s.choices[b.email] || {};
      s.choices[b.email][b.options_list_id] = ordered;
      return ok({});
    },
    '/api/course/student/get_student_course': function (s, b) {
      var mine = s.courses.filter(function (c) { return c.students.indexOf(b.email) !== -1; });
      return ok({ courses: mine.map(function (c) { return courseOut(s, c); }) });
    },

    '/api/course/teacher/get_teacher_courses': function (s, b) {
      if (!teacherOf(s, b.email)) return [404, { code: 'TEACHER_NOT_FOUND' }];
      var mine = s.courses.filter(function (c) { return c.teacher_email === b.email; });
      return ok({ courses: mine.map(function (c) {
        return { id: c.id, title: c.title, students: c.students.map(function (e) {
          var st = student(s, e) || { email: e, first_name: '', last_name: '' };
          return { email: st.email, first_name: st.first_name, last_name: st.last_name };
        }) };
      }) });
    },
    '/api/user/teacher/send_announcement': function () { return ok({}); },

    '/api/course/admin/get_courses': function (s) { return [200, { courses: s.courses.map(function (c) { return courseOut(s, c); }) }]; },
    '/api/course/admin/create_course': function (s, b) {
      if (!teacherOf(s, b.teacher_email)) return [404, { code: 'TEACHER_NOT_FOUND' }];
      if (s.courses.some(function (c) { return c.title === b.title; })) return [500, { code: 'COURSE_ALREADY_EXISTS' }];
      s.courses.push({ id: s.nextCourseId++, title: b.title, link: b.link, capacity: Number(b.capacity), degree: b.degree,
                       semester: Number(b.semester), teacher_email: b.teacher_email, students: [] });
      return ok({});
    },
    '/api/course/admin/update_course': function (s, b) {
      var c = courseById(s, b.id);
      if (!c) return [500, { code: 'ERROR' }];
      if (!teacherOf(s, b.teacher_email)) return [404, { code: 'TEACHER_NOT_FOUND' }];
      c.title = b.title; c.link = b.link; c.capacity = Number(b.capacity); c.degree = b.degree;
      c.semester = Number(b.semester); c.teacher_email = b.teacher_email;
      return ok({});
    },
    '/api/course/admin/delete_course': function (s, b) {
      s.courses = s.courses.filter(function (c) { return c.id !== Number(b.id); });
      s.lists.forEach(function (l) { l.courses = l.courses.filter(function (id) { return id !== Number(b.id); }); });
      return ok({});
    },
    '/api/course/admin/get_options_lists': function (s) {
      return ok({ options_lists: s.lists.map(function (l) {
        return { id: l.id, domain: l.domain, learning_mode: l.learning_mode, degree: l.degree, study_program: l.study_program,
                 year: l.year, semester: l.semester, title: l.title, courses: l.courses.map(function (id) { return { id: id }; }) };
      }) });
    },
    '/api/course/admin/create_options_list': function (s, b) {
      s.lists.push({ id: s.nextListId++, title: b.title, domain: b.domain, learning_mode: b.learning_mode, degree: b.degree,
                     study_program: b.study_program, year: Number(b.year), semester: Number(b.semester),
                     courses: (b.courses_ids || []).map(Number) });
      return ok({});
    },
    '/api/course/admin/update_options_list': function (s, b) {
      var l = s.lists.filter(function (x) { return x.id === Number(b.id); })[0];
      if (!l) return [404, { code: 'OPTIONS_LIST_NOT_FOUND' }];
      ['title', 'domain', 'learning_mode', 'degree', 'study_program'].forEach(function (k) { l[k] = b[k]; });
      l.year = Number(b.year); l.semester = Number(b.semester); l.courses = (b.courses_ids || []).map(Number);
      return ok({});
    },
    '/api/course/admin/delete_options_list': function (s, b) {
      s.lists = s.lists.filter(function (l) { return l.id !== Number(b.id); });
      return ok({});
    },

    '/api/user/admin/students': function (s, b, method) {
      if (method === 'GET') return ok({ students: s.students });
      var st = student(s, b.email);
      if (!st) return [404, { code: 'STUDENT_NOT_FOUND' }];
      ['first_name', 'last_name', 'domain', 'learning_mode', 'degree', 'study_program', 'current_group'].forEach(function (k) { st[k] = b[k]; });
      st.current_year = Number(b.current_year); st.grades = b.grades || st.grades;
      return ok({});
    },
    '/api/user/admin/teachers': function (s, b, method) {
      if (method === 'GET') {
        return ok({ teachers: s.teachers.map(function (t) {
          return { email: t.email, first_name: t.first_name, last_name: t.last_name,
                   courses: s.courses.filter(function (c) { return c.teacher_email === t.email; }).map(function (c) { return courseOut(s, c); }) };
        }) });
      }
      var t = teacherOf(s, b.email);
      if (t) { t.first_name = b.first_name; t.last_name = b.last_name; }
      return ok({});
    },
    '/api/user/admin/not_verified_users': function (s, b, method) {
      if (method === 'GET') return ok({ users: s.not_verified });
      s.not_verified = s.not_verified.filter(function (e) { return e !== b.email; });
      if (b.role === 'TEACHER') s.teachers.push({ email: b.email, first_name: b.first_name, last_name: b.last_name });
      else s.students.push({ email: b.email, first_name: b.first_name, last_name: b.last_name, domain: 'INFO', learning_mode: 'IF',
                             degree: 'BACHELOR', study_program: 'INFO', current_group: '231', current_year: 2, grades: [{ grade: 9, year: 1 }] });
      return ok({});
    },
    '/api/user/admin/delete_user': function (s, b) {
      if (s.courses.some(function (c) { return c.teacher_email === b.email; })) return [500, { code: 'TEACHER_HAS_COURSE' }];
      s.students = s.students.filter(function (x) { return x.email !== b.email; });
      s.teachers = s.teachers.filter(function (x) { return x.email !== b.email; });
      s.not_verified = s.not_verified.filter(function (e) { return e !== b.email; });
      return ok({});
    },
    '/api/user/admin/register_batch_students': function (s, b) {
      (b.students || []).forEach(function (r) {
        if (student(s, r.email)) return;
        var grades = [r.grade1, r.grade2, r.grade3, r.grade4].map(function (g, i) { return { grade: Number(g), year: i + 1 }; }).filter(function (g) { return g.grade; });
        s.students.push({ email: r.email, first_name: r.first_name, last_name: r.last_name, domain: r.domain, learning_mode: r.learning_mode,
                          degree: r.degree, study_program: r.study_program, current_group: String(r.current_group),
                          current_year: Number(r.current_year), grades: grades });
      });
      return ok({ error_messages: [] });
    },
    '/api/user/admin/register_batch_teachers': function (s, b) {
      (b.teachers || []).forEach(function (r) { if (!teacherOf(s, r.email)) s.teachers.push({ email: r.email, first_name: r.first_name, last_name: r.last_name }); });
      return ok({ error_messages: [] });
    },
    '/api/user/admin/update_selection_session_open': function (s, b) {
      s.session_open = b.value;
      if (b.value === 'FALSE') assignSeats(s);
      else s.courses.forEach(function (c) { c.students = []; });
      return ok({});
    },
    '/api/user/admin/get_students_lists': function (s) {
      var lists = [];
      s.lists.forEach(function (l) {
        l.courses.forEach(function (id) {
          var c = courseById(s, id);
          if (!c) return;
          lists.push({ course: c.title, domain: l.domain, degree: l.degree, learning_mode: l.learning_mode, study_program: l.study_program,
                       year: l.year, students: c.students.map(function (e) {
                         var st = student(s, e) || {}; return { first_name: st.first_name, last_name: st.last_name, current_group: st.current_group };
                       }) });
        });
      });
      return ok({ lists: lists });
    }
  };

  function handle(method, url, body) {
    var path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    var route = routes[path];
    if (!route) return [404, { code: 'ERROR' }];
    var data = {};
    try { data = body ? JSON.parse(body) : {}; } catch (e) {}
    var s = load();
    var res = route(s, data, method.toUpperCase());
    save(s);
    return res;
  }

  /* ---- XMLHttpRequest shim (axios uses XHR in the browser) -------------- */

  var RealXHR = window.XMLHttpRequest;
  function DemoXHR() {
    var xhr = new RealXHR();
    var mock = false, method = 'GET', url = '';
    var origOpen = xhr.open, origSend = xhr.send, origSet = xhr.setRequestHeader, origHeaders = xhr.getAllResponseHeaders;
    xhr.open = function (m, u) {
      mock = String(u).indexOf(HOST) !== -1;
      method = m; url = u;
      if (!mock) return origOpen.apply(xhr, arguments);
    };
    xhr.setRequestHeader = function () { if (!mock) return origSet.apply(xhr, arguments); };
    xhr.getAllResponseHeaders = function () { return mock ? 'content-type: application/json\r\n' : origHeaders.apply(xhr, arguments); };
    xhr.getResponseHeader = function (h) { return mock ? (String(h).toLowerCase() === 'content-type' ? 'application/json' : null) : RealXHR.prototype.getResponseHeader.call(xhr, h); };
    xhr.send = function (body) {
      if (!mock) return origSend.apply(xhr, arguments);
      setTimeout(function () {
        var res = handle(method, url, body);
        var text = JSON.stringify(res[1]);
        Object.defineProperty(xhr, 'readyState', { value: 4, configurable: true });
        Object.defineProperty(xhr, 'status', { value: res[0], configurable: true });
        Object.defineProperty(xhr, 'statusText', { value: res[0] === 200 ? 'OK' : 'Error', configurable: true });
        Object.defineProperty(xhr, 'responseText', { value: text, configurable: true });
        Object.defineProperty(xhr, 'response', { value: text, configurable: true });
        Object.defineProperty(xhr, 'responseURL', { value: url, configurable: true });
        if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange();
        if (typeof xhr.onload === 'function') xhr.onload();
        if (typeof xhr.onloadend === 'function') xhr.onloadend();
      }, DELAY);
    };
    return xhr;
  }
  DemoXHR.UNSENT = 0; DemoXHR.OPENED = 1; DemoXHR.HEADERS_RECEIVED = 2; DemoXHR.LOADING = 3; DemoXHR.DONE = 4;
  window.XMLHttpRequest = DemoXHR;

  /* ---- WebSocket shim: the server broadcast after the session changes --- */

  var RealWS = window.WebSocket;
  window.WebSocket = function (u, p) {
    if (String(u).indexOf(HOST) === -1) return new RealWS(u, p);
    var sock = { readyState: 0, onopen: null, onmessage: null, onclose: null, onerror: null, close: function () { sock.readyState = 3; } };
    sock.send = function () {
      setTimeout(function () {
        if (typeof sock.onmessage === 'function') {
          sock.onmessage({ data: JSON.stringify({ type: 'set_selection_session_open', SELECTION_SESSION_OPEN: load().session_open }) });
        }
      }, DELAY);
    };
    setTimeout(function () { sock.readyState = 1; if (typeof sock.onopen === 'function') sock.onopen({}); }, DELAY);
    return sock;
  };

  /* ---- boot: English by default, and run at the router's root ----------- */

  try { if (!localStorage.getItem('language')) localStorage.setItem('language', 'en'); } catch (e) {}
  /* Sign-out calls localStorage.clear(); keep the chosen language across it. */
  try {
    var realClear = Storage.prototype.clear;
    localStorage.clear = function () {
      var lang = localStorage.getItem('language');
      realClear.call(localStorage);
      if (lang) localStorage.setItem('language', lang);
    };
  } catch (e) {}
  window.resetElectiveDemo = function () {
    try {
      sessionStorage.removeItem(STORE);
      Object.keys(localStorage).forEach(function (k) { if (k.indexOf('persist:') === 0) localStorage.removeItem(k); });
    } catch (e) {}
  };
  /* The app's router expects to live at "/", so present the demo there. */
  if (location.pathname !== '/') history.replaceState(null, '', '/login');
})();
