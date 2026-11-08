import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../worker/index.js';

test('only the owner can authorize, and callback rejects a different Google account',async t => {
  const env = {
    TIPI_ORIGIN:'https://tipi.example',TIPI_SUPABASE_URL:'https://project.supabase.co',
    TIPI_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_mock',TIPI_SUPABASE_SERVER_KEY:'sb_secret_mock',
    GOOGLE_CLIENT_ID:'mock',GOOGLE_CLIENT_SECRET:'mock',
    TIPI_GOOGLE_ENCRYPTION_KEY:'1'.repeat(64)
  };
  let role = 'support';
  let email = 'wrong@example.test';
  let config = {};
  t.mock.method(globalThis,'fetch',async (url,options) => {
    const name = new URL(url).pathname;
    const body = options.body;
    if (name.endsWith('/tipi_workspace')) {
      assert.equal(options.headers.Authorization,'Bearer session');
      return Response.json({workspace_id:'workspace',role});
    }
    if (name.endsWith('/auth/v1/user')) return Response.json({id:'person'});
    if (name.endsWith('/tipi_google_owner')) return Response.json({workspace_id:'workspace',email:'owner@example.test'});
    if (name.endsWith('/token')) return Response.json({
      access_token:'access',refresh_token:'do-not-return-this',
      scope:'openid email https://www.googleapis.com/auth/drive.file'
    });
    if (name.endsWith('/userinfo')) return Response.json({email,email_verified:true,sub:'google-user'});
    if (name.endsWith('/tipi_google_lock')) return Response.json(true);
    if (name.endsWith('/tipi_google')) {
      if (options.method==='PATCH') config=JSON.parse(body).config || config;
      return Response.json([{config}]);
    }
    throw new Error('Unexpected request: '+name);
  });
  const post = action => worker.fetch(new Request(env.TIPI_ORIGIN+'/api/google/'+action,{
    method:'POST',headers:{Authorization:'Bearer session'},body:JSON.stringify({features:['sheets']})
  }),env);
  assert.equal((await post('connect')).status,403);
  role = 'owner';
  const begin = await post('connect');
  assert.equal(begin.status,200);
  const cookie = begin.headers.get('Set-Cookie').split(';')[0];
  const authorization = new URL((await begin.json()).url);
  assert.equal(authorization.searchParams.get('code_challenge_method'),'S256');
  const callback = state => worker.fetch(new Request(env.TIPI_ORIGIN+'/api/google/callback?code=code&state='+state,{
    headers:{Cookie:cookie}
  }),env);
  assert.match((await callback('bad')).headers.get('Location'),/google=expired/);
  assert.match((await callback(authorization.searchParams.get('state'))).headers.get('Location'),/google=wrong-account/);
  assert.deepEqual(config,{});
  email = 'owner@example.test';
  assert.match((await callback(authorization.searchParams.get('state'))).headers.get('Location'),/google=connected/);
  assert.equal(config.email,email);
  assert.equal(config.sheets,true);
  assert.doesNotMatch(JSON.stringify(config),/do-not-return-this/);
});
