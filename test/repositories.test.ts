import { createMemoryRepositories } from '../src/persistence/memory/memoryRepositories';
import { repositoryContract } from './repositoryContract';

repositoryContract('in-memory', async () => createMemoryRepositories());
