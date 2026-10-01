const crypto = require('crypto');

const REPO = process.env.GITHUB_REPO || 'DocMoon69/physiology-department';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const TOKEN = process.env.GITHUB_TOKEN;
const PASSWORD = process.env.ADMIN_PASSWORD;
const SECRET = process.env.SESSION_SECRET || 'change-this-secret';

const DATA_PATH = 'data/faculty.json';

function b64(s) {
  return Buffer.from(s)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function sign(v) {
  return crypto
    .createHmac('sha256', SECRET)
    .update(v)
    .digest('base64url');
}

function makeSession() {
  const payload = b64(
    JSON.stringify({
      exp: Date.now() + 8 * 60 * 60 * 1000
    })
  );

  return payload + '.' + sign(payload);
}

function validSession(req) {
  const c = req.headers.cookie || '';

  const m = c.match(/(?:^|; )physio_admin=([^;]+)/);

  if (!m) return false;

  const parts = m[1].split('.');
  const p = parts[0];
  const s = parts[1];

  if (!p || !s) return false;

  const a = Buffer.from(s);
  const b = Buffer.from(sign(p));

  if (a.length !== b.length) return false;

  if (!crypto.timingSafeEqual(a, b)) return false;

  try {
    const session = JSON.parse(
      Buffer.from(p, 'base64url').toString()
    );

    return session.exp > Date.now();
  } catch {
    return false;
  }
}

function cookie(v, max = 28800) {
  return `physio_admin=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${max}`;
}


/* --------------------------------------------------
   GITHUB API
-------------------------------------------------- */

async function gh(path, options = {}) {

  if (!TOKEN) {
    throw new Error(
      'GITHUB_TOKEN is not configured in Vercel.'
    );
  }

  const response = await fetch(
    'https://api.github.com/repos/' +
      REPO +
      '/contents/' +
      path,
    {
      ...options,

      headers: {
        Accept: 'application/vnd.github+json',

        Authorization: 'Bearer ' + TOKEN,

        'X-GitHub-Api-Version': '2022-11-28',

        ...(options.headers || {})
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message || 'GitHub request failed'
    );
  }

  return data;
}


/* --------------------------------------------------
   ALWAYS READ THE LATEST VERSION FROM GITHUB
-------------------------------------------------- */

async function getData() {

  const file = await gh(DATA_PATH);

  const content = Buffer.from(
    file.content.replace(/\n/g, ''),
    'base64'
  ).toString('utf8');

  return JSON.parse(content);
}


/* --------------------------------------------------
   WRITE FILE
-------------------------------------------------- */

async function putFile(
  path,
  content,
  message,
  sha
) {

  const body = {
    message,
    content: Buffer.from(content).toString('base64'),
    branch: BRANCH,
    sha
  };

  return gh(
    path,
    {
      method: 'PUT',

      headers: {
        'Content-Type': 'application/json'
      },

      body: JSON.stringify(body)
    }
  );
}


/* --------------------------------------------------
   JSON RESPONSE
-------------------------------------------------- */

function json(
  res,
  status,
  data,
  extra = {}
) {

  res.statusCode = status;

  for (const [key, value] of Object.entries(extra)) {
    res.setHeader(key, value);
  }

  res.setHeader(
    'Content-Type',
    'application/json'
  );

  res.end(JSON.stringify(data));
}


/* --------------------------------------------------
   MAIN API
-------------------------------------------------- */

module.exports = async (req, res) => {

  try {

    const action =
      new URL(
        req.url,
        'http://localhost'
      )
        .searchParams
        .get('action') || 'list';


    /* ------------------------------------------------
       LOGIN
    ------------------------------------------------ */

    if (action === 'login') {

      if (req.method !== 'POST') {
        return json(
          res,
          405,
          {
            error: 'Method not allowed'
          }
        );
      }

      let body = '';

      for await (const chunk of req) {
        body += chunk;
      }

      const { password } =
        JSON.parse(body || '{}');

      if (
        !PASSWORD ||
        password !== PASSWORD
      ) {

        return json(
          res,
          401,
          {
            error: 'Incorrect password.'
          }
        );
      }

      return json(
        res,
        200,
        {
          ok: true
        },
        {
          'Set-Cookie':
            cookie(makeSession())
        }
      );
    }


    /* ------------------------------------------------
       LOGOUT
    ------------------------------------------------ */

    if (action === 'logout') {

      return json(
        res,
        200,
        {
          ok: true
        },
        {
          'Set-Cookie':
            cookie('', 0)
        }
      );
    }


    /* ------------------------------------------------
       SESSION CHECK
    ------------------------------------------------ */

    if (action === 'session') {

      return json(
        res,
        200,
        {
          authenticated:
            validSession(req)
        }
      );
    }


    /* ------------------------------------------------
       PUBLIC FACULTY DATA
    ------------------------------------------------ */

    if (action === 'faculty') {

      return json(
        res,
        200,
        await getData()
      );
    }


    /* ------------------------------------------------
       ADMIN AUTHENTICATION
    ------------------------------------------------ */

    if (!validSession(req)) {

      return json(
        res,
        401,
        {
          error:
            'Please log in again.'
        }
      );
    }


    /* ------------------------------------------------
       LIST FACULTY
    ------------------------------------------------ */

    if (action === 'list') {

      return json(
        res,
        200,
        await getData()
      );
    }


    /* ------------------------------------------------
       READ REQUEST BODY
    ------------------------------------------------ */

    let body = '';

    for await (const chunk of req) {
      body += chunk;
    }

    const input =
      JSON.parse(body || '{}');


    /* ------------------------------------------------
       SAVE / UPDATE FACULTY
    ------------------------------------------------ */

    if (action === 'save') {

      if (!input.name) {

        return json(
          res,
          400,
          {
            error:
              'Faculty name is required.'
          }
        );
      }


      /*
        IMPORTANT:

        Every faculty member has a UNIQUE ID.

        Therefore changing one person only
        changes that person's record.
      */

      const id =
        String(input.id || '').trim();

      if (!id) {

        return json(
          res,
          400,
          {
            error:
              'Faculty ID is required.'
          }
        );
      }


      const data =
        await getData();


      /* ------------------------------------------------
         FIND ONLY THE PERSON BEING EDITED
      ------------------------------------------------ */

      const index =
        data.faculty.findIndex(
          faculty =>
            faculty.id === id
        );


      /* ------------------------------------------------
         CREATE UPDATED RECORD
      ------------------------------------------------ */

      const updatedFaculty = {

        id: id,

        name:
          String(
            input.name || ''
          ).trim(),

        role:
          String(
            input.role || 'FACULTY'
          ).trim(),

        designation:
          String(
            input.designation || ''
          ).trim(),

        qualification:
          String(
            input.qualification || ''
          ).trim(),

        about:
          String(
            input.about || ''
          ).trim(),

        research:
          String(
            input.research || ''
          ).trim(),

        email:
          String(
            input.email || ''
          ).trim(),

        photo:
          String(
            input.photo || ''
          ).trim()
      };


      /* ------------------------------------------------
         PHOTO UPLOAD
      ------------------------------------------------ */

      if (
        updatedFaculty.photo.startsWith(
          'data:'
        )
      ) {

        const match =
          updatedFaculty.photo.match(
            /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/
          );

        if (!match) {

          return json(
            res,
            400,
            {
              error:
                'Unsupported image format.'
            }
          );
        }


        const extension =
          match[1]
            .split('/')[1]
            .replace(
              'jpeg',
              'jpg'
            );


        const photoPath =
          'images/faculty/' +
          id +
          '.' +
          extension;


        let existingPhotoSha = null;


        try {

          const existing =
            await gh(photoPath);

          existingPhotoSha =
            existing.sha;

        } catch {
          existingPhotoSha = null;
        }


        const photoBody = {

          message:
            'Update faculty photo: ' +
            updatedFaculty.name,

          content:
            match[2],

          branch:
            BRANCH
        };


        if (existingPhotoSha) {

          photoBody.sha =
            existingPhotoSha;
        }


        await gh(
          photoPath,
          {
            method: 'PUT',

            headers: {
              'Content-Type':
                'application/json'
            },

            body:
              JSON.stringify(
                photoBody
              )
          }
        );


        updatedFaculty.photo =
          '/' + photoPath;
      }


      /* ------------------------------------------------
         UPDATE ONLY THIS FACULTY MEMBER
      ------------------------------------------------ */

      if (index >= 0) {

        data.faculty[index] =
          updatedFaculty;

      } else {

        data.faculty.push(
          updatedFaculty
        );
      }


      /* ------------------------------------------------
         GET THE CURRENT FILE SHA

         This prevents overwriting
         newer GitHub data.
      ------------------------------------------------ */

      const currentFile =
        await gh(DATA_PATH);


      /* ------------------------------------------------
         SAVE COMPLETE UPDATED DATABASE
      ------------------------------------------------ */

      await putFile(
        DATA_PATH,

        JSON.stringify(
          data,
          null,
          2
        ) + '\n',

        'Update faculty profile: ' +
          updatedFaculty.name,

        currentFile.sha
      );


      return json(
        res,
        200,
        data
      );
    }


    /* ------------------------------------------------
       DELETE FACULTY
    ------------------------------------------------ */

    if (action === 'delete') {

      const id =
        String(
          input.id || ''
        );


      const data =
        await getData();


      const faculty =
        data.faculty.find(
          f => f.id === id
        );


      if (!faculty) {

        return json(
          res,
          404,
          {
            error:
              'Faculty not found.'
          }
        );
      }


      data.faculty =
        data.faculty.filter(
          f => f.id !== id
        );


      const currentFile =
        await gh(DATA_PATH);


      await putFile(
        DATA_PATH,

        JSON.stringify(
          data,
          null,
          2
        ) + '\n',

        'Delete faculty profile: ' +
          faculty.name,

        currentFile.sha
      );


      return json(
        res,
        200,
        data
      );
    }


    /* ------------------------------------------------
       UNKNOWN ACTION
    ------------------------------------------------ */

    return json(
      res,
      404,
      {
        error:
          'Unknown action.'
      }
    );


  } catch (error) {

    return json(
      res,
      500,
      {
        error:
          error.message ||
          'Server error'
      }
    );
  }
};
