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
it('file sharing build excludes store entry even when the upstream service advertises it',()=>{
 render(<TaskLauncher storeEnabled={true} onSelect={()=>{}}/>);
 expect(screen.queryByRole('button',{name:'Store files'})).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Send live'})).toBeVisible();
 expect(screen.getByRole('button',{name:'Receive files'})).toBeVisible();
 expect(taskFromHash('#store')).toBe('home');
 expect(taskFromHash('#store?code=synthetic')).toBe('home');
 expect(taskFromHash('#send-panel')).toBe('send');
 expect(taskFromHash('#receive')).toBe('receive');
});
