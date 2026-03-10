import {
  createGroupRepository,
  createListRepository,
  createMembershipRepository,
  createTodoRepository,
  createUserRepository,
  resetInMemoryRepositories,
} from '../../src/repositories/factory.js';
import type { GroupRepository } from '../../src/repositories/group/group-repository.interface.js';
import type { ListRepository } from '../../src/repositories/list/list-repository.interface.js';
import type { MembershipRepository } from '../../src/repositories/membership/membership-repository.interface.js';
import type { TodoRepository } from '../../src/repositories/todo/todo-repository.interface.js';
import type { UserRepository } from '../../src/repositories/user/user-repository.interface.js';

describe('Repository Layer E2E with InMemory repositories', () => {
  const previousUseInMemoryDb = process.env.USE_IN_MEMORY_DB;

  let userRepository: UserRepository;
  let groupRepository: GroupRepository;
  let membershipRepository: MembershipRepository;
  let listRepository: ListRepository;
  let todoRepository: TodoRepository;

  beforeAll(() => {
    process.env.USE_IN_MEMORY_DB = 'true';
  });

  afterAll(() => {
    if (previousUseInMemoryDb === undefined) {
      delete process.env.USE_IN_MEMORY_DB;
      return;
    }

    process.env.USE_IN_MEMORY_DB = previousUseInMemoryDb;
  });

  beforeEach(() => {
    resetInMemoryRepositories();
    userRepository = createUserRepository();
    groupRepository = createGroupRepository();
    membershipRepository = createMembershipRepository();
    listRepository = createListRepository();
    todoRepository = createTodoRepository();
  });

  it('個人リストとToDoの作成・取得・更新・削除を一連で実行できる', async () => {
    await userRepository.create({
      userId: 'user-001',
      email: 'user-001@example.com',
      name: 'User 001',
      defaultListId: 'list-default-user-001',
    });

    const personalList = await listRepository.createPersonalList({
      listId: 'list-personal-001',
      userId: 'user-001',
      name: '買い物リスト',
      isDefault: false,
    });

    const createdTodo = await todoRepository.create({
      todoId: 'todo-001',
      listId: personalList.listId,
      title: '牛乳を買う',
      isCompleted: false,
      createdBy: 'user-001',
    });

    const todos = await todoRepository.getByListId(personalList.listId);
    expect(todos).toHaveLength(1);
    expect(todos[0]).toMatchObject({
      todoId: 'todo-001',
      title: '牛乳を買う',
      isCompleted: false,
    });
    expect(createdTodo.createdAt).toBeDefined();

    const updatedList = await listRepository.updatePersonalList('user-001', personalList.listId, {
      name: '週末の買い物リスト',
    });
    expect(updatedList.name).toBe('週末の買い物リスト');

    const updatedTodo = await todoRepository.update(personalList.listId, createdTodo.todoId, {
      title: '牛乳と卵を買う',
      isCompleted: true,
      completedBy: 'user-001',
    });
    expect(updatedTodo).toMatchObject({
      title: '牛乳と卵を買う',
      isCompleted: true,
      completedBy: 'user-001',
    });

    await todoRepository.delete(personalList.listId, createdTodo.todoId);
    await expect(todoRepository.getByListId(personalList.listId)).resolves.toEqual([]);

    await listRepository.deletePersonalList('user-001', personalList.listId);
    await expect(listRepository.getPersonalListsByUserId('user-001')).resolves.toEqual([]);
  });

  it('グループ・メンバーシップ・共有リスト・共有ToDoの連携フローを実行できる', async () => {
    await userRepository.create({
      userId: 'owner-001',
      email: 'owner-001@example.com',
      name: 'Owner 001',
      defaultListId: 'list-default-owner-001',
    });
    await userRepository.create({
      userId: 'member-001',
      email: 'member-001@example.com',
      name: 'Member 001',
      defaultListId: 'list-default-member-001',
    });

    const group = await groupRepository.create({
      groupId: 'group-001',
      name: '週次共有タスク',
      ownerUserId: 'owner-001',
    });

    await membershipRepository.create({
      groupId: group.groupId,
      userId: 'owner-001',
      role: 'OWNER',
      status: 'ACCEPTED',
    });
    await membershipRepository.create({
      groupId: group.groupId,
      userId: 'member-001',
      role: 'MEMBER',
      status: 'PENDING',
      invitedBy: 'owner-001',
      invitedAt: new Date().toISOString(),
      ttl: Math.floor(Date.now() / 1000) + 86400,
    });

    const acceptedMembership = await membershipRepository.update(group.groupId, 'member-001', {
      status: 'ACCEPTED',
      respondedAt: new Date().toISOString(),
    });
    expect(acceptedMembership.status).toBe('ACCEPTED');

    const groupList = await listRepository.createGroupList({
      listId: 'group-list-001',
      groupId: group.groupId,
      name: 'リリース準備',
      createdBy: 'owner-001',
    });

    const createdSharedTodo = await todoRepository.create({
      todoId: 'group-todo-001',
      listId: groupList.listId,
      title: 'リリースノートを確認',
      isCompleted: false,
      createdBy: 'owner-001',
    });
    expect(createdSharedTodo.listId).toBe(groupList.listId);

    const completedSharedTodo = await todoRepository.update(groupList.listId, createdSharedTodo.todoId, {
      isCompleted: true,
      completedBy: 'member-001',
    });
    expect(completedSharedTodo).toMatchObject({
      isCompleted: true,
      completedBy: 'member-001',
    });

    await expect(membershipRepository.getByGroupId(group.groupId)).resolves.toHaveLength(2);
    await expect(listRepository.getGroupListsByGroupId(group.groupId)).resolves.toHaveLength(1);
    await expect(todoRepository.getByListId(groupList.listId)).resolves.toHaveLength(1);

    await todoRepository.deleteByListId(groupList.listId);
    await listRepository.deleteGroupList(group.groupId, groupList.listId);
    await membershipRepository.deleteByGroupId(group.groupId);
    await groupRepository.delete(group.groupId);

    await expect(todoRepository.getByListId(groupList.listId)).resolves.toEqual([]);
    await expect(listRepository.getGroupListsByGroupId(group.groupId)).resolves.toEqual([]);
    await expect(membershipRepository.getByGroupId(group.groupId)).resolves.toEqual([]);
    await expect(groupRepository.getById(group.groupId)).resolves.toBeNull();
  });
});
