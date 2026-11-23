import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  SupportAssigneeDto,
  SupportCursorQueryDto,
  SupportListQueryDto,
  SupportReadDto,
} from '../support-workflow.dto';

describe('support workflow input boundaries', () => {
  it('accepts explicit unassignment but rejects a missing or forged staff identity', async () => {
    expect(
      await validate(plainToInstance(SupportAssigneeDto, { staffId: null })),
    ).toHaveLength(0);
    for (const value of [{}, { staffId: -1 }, { staffId: '2' }]) {
      expect(
        (await validate(plainToInstance(SupportAssigneeDto, value))).length,
      ).toBeGreaterThan(0);
    }
  });
  it('bounds pagination and restricts staff filters', async () => {
    expect(
      await validate(
        plainToInstance(SupportListQueryDto, {
          page: '2',
          limit: '25',
          assignee: 'me',
          staff: 'true',
        }),
      ),
    ).toHaveLength(0);
    for (const value of [
      { page: 0 },
      { limit: 51 },
      { assignee: '1 OR 1=1' },
      { staff: 'admin' },
    ]) {
      expect(
        (await validate(plainToInstance(SupportListQueryDto, value))).length,
      ).toBeGreaterThan(0);
    }
  });
  it('requires message identifiers instead of arbitrary sequence numbers', async () => {
    expect(
      (
        await validate(
          plainToInstance(SupportReadDto, { throughMessageId: '99999999' }),
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await validate(
          plainToInstance(SupportCursorQueryDto, {
            before: 'foreign-sql',
            limit: 1000,
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
