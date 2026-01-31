using Microsoft.AspNetCore.Components.Forms;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System;
using System.Diagnostics;
using Tasklog.Data;
using Tasklog.Models;

namespace Tasklog.Controllers
{
    public class TaskController : Controller
    {
        private readonly ILogger<TaskController> _logger;
        private readonly TasklogDbContext _context;
        public TaskController(ILogger<TaskController> logger, TasklogDbContext context)
        {
            _logger = logger;
            _context = context;
        }

        [HttpGet("/")]
        public async Task<IActionResult> Index()
        {
            var tasks = await _context.Tasks.OrderByDescending(x => x.CreatedAt).ToListAsync();
            return View(tasks);
        }
        [HttpGet("/task/{id:int}")]
        public async Task<IActionResult> Details(int id)
        {

            var currentTask = await _context.Tasks.FindAsync(id);
            if (currentTask != null)
            {
                return View(currentTask);
            }
            else
            {
                TempData["ErrorMessage"] = $"Error: Task with id {id} Does not exist";
                return RedirectToAction("Index");
            }
        }

        [HttpPost("/task/add")]
        public async Task<IActionResult> Create(string title, DateTime? deadline)
        {
            if (string.IsNullOrEmpty(title))
            {
                TempData["ErrorMessage"] = $"Error: Please enter title. Task with Empty Title is not allowed.";
                return RedirectToAction("Index");
            }

            var inputTask = new TaskModel()
            {
                Title = title,
                Deadline = deadline,
                CreatedAt = DateTime.Now
            };

            _context.Tasks.Add(inputTask);
            await _context.SaveChangesAsync();

            TempData["Message"] = $"Successfully Added Task Id:{inputTask.Id} :: Title:{inputTask.Title}";
            return RedirectToAction("Index");
        }

        [HttpPost("/task/delete/{id}")]
        public async Task<IActionResult> Delete(int id)
        {

            var currentTask = await _context.Tasks.FindAsync(id);
            if (currentTask != null)
            {
                _context.Tasks.Remove(currentTask);
                await _context.SaveChangesAsync();
                TempData["Message"] = $"Successfully Deleted Task Id:{currentTask.Id} :: Title:{currentTask.Title}";
                return RedirectToAction("Index");
            }
            else
            {
                TempData["ErrorMessage"] = $"Error: Task with id {id} Does not exist";
                return RedirectToAction("Index");
            }
        }

    }
}
