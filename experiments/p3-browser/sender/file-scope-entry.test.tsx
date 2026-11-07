import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {TaskLauncher,taskFromHash} from './TaskLauncher';
afterEach(cleanup);
it('file sharing build excludes terminal entry and deep link',()=>{
 render(<TaskLauncher storeEnabled={false} onSelect={()=>{}}/>);
 expect(screen.queryByRole('button',{name:'Join SSH'})).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Send live'})).toBeVisible();
 expect(screen.getByRole('button',{name:'Receive files'})).toBeVisible();
 expect(taskFromHash('#ssh?code=synthetic')).toBe('home');
});
