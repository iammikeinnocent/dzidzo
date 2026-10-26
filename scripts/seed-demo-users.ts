import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
  AdminGetUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminListGroupsForUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const REGION = 'us-east-1';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'DemoPass123!';
const TENANT_ID = process.env.TENANT_ID ?? 'tenant-1';
const USER_POOL_ID = process.env.USER_POOL_ID;

if (!USER_POOL_ID) {
  console.error('ERROR: USER_POOL_ID environment variable is required');
  console.error('Get it from CDK output: dzidzo-dev-user-pool-id');
  process.exit(1);
}

const client = new CognitoIdentityProviderClient({ region: REGION });

interface DemoUser {
  email: string;
  role: 'teacher' | 'director';
}

const USERS: DemoUser[] = [
  { email: process.env.TEACHER_EMAIL ?? 'teacher@example.com', role: 'teacher' },
  { email: process.env.DIRECTOR_EMAIL ?? 'director@example.com', role: 'director' },
];

async function userExists(username: string): Promise<boolean> {
  try {
    await client.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
    return true;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'UserNotFoundException') {
      return false;
    }
    throw err;
  }
}

async function getUserGroups(username: string): Promise<string[]> {
  const response = await client.send(
    new AdminListGroupsForUserCommand({ UserPoolId: USER_POOL_ID, Username: username }),
  );
  return response.Groups?.map((g) => g.GroupName ?? '') ?? [];
}

async function ensureUser(user: DemoUser): Promise<void> {
  const { email, role } = user;
  const exists = await userExists(email);

  if (!exists) {
    console.log(`Creating user: ${email} (${role})`);
    await client.send(
      new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'custom:tenant_id', Value: TENANT_ID },
        ],
        TemporaryPassword: DEMO_PASSWORD,
        MessageAction: 'SUPPRESS',
      }),
    );
  } else {
    console.log(`User exists: ${email}`);
  }

  console.log(`Setting permanent password for ${email}`);
  await client.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      Password: DEMO_PASSWORD,
      Permanent: true,
    }),
  );

  const currentGroups = await getUserGroups(email);
  const targetGroup = role;

  if (!currentGroups.includes(targetGroup)) {
    if (currentGroups.length > 0) {
      for (const group of currentGroups) {
        console.log(`Removing ${email} from group: ${group}`);
        await client.send(
          new AdminRemoveUserFromGroupCommand({
            UserPoolId: USER_POOL_ID,
            Username: email,
            GroupName: group,
          }),
        );
      }
    }
    console.log(`Adding ${email} to group: ${targetGroup}`);
    await client.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        GroupName: targetGroup,
      }),
    );
  } else {
    console.log(`${email} already in correct group: ${targetGroup}`);
  }
}

async function main(): Promise<void> {
  console.log('Seeding demo users...');
  console.log(`User Pool: ${USER_POOL_ID}`);
  console.log(`Tenant ID: ${TENANT_ID}`);
  console.log(`Region: ${REGION}`);
  console.log('');

  for (const user of USERS) {
    try {
      await ensureUser(user);
      console.log(`✓ ${user.email} ready`);
    } catch (err) {
      console.error(`✗ Failed for ${user.email}:`, err);
      process.exit(1);
    }
    console.log('');
  }

  console.log('All demo users seeded successfully!');
  console.log('');
  console.log('Login credentials:');
  for (const user of USERS) {
    console.log(`  ${user.email} / ${DEMO_PASSWORD} (${user.role})`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});